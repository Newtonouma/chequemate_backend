import asyncHandler from "express-async-handler";
import pool from "../config/database.js";
import userStatsCache from "../services/UserStatsCache.js";
import chessComApiQueue from "../services/ChessComApiQueue.js";
import User from "../models/User.js";

// Helper function to fetch Chess.com profile
const fetchChessComProfile = async (username) => {
  try {
    const result = await chessComApiQueue.request({
      method: "get",
      url: `https://api.chess.com/pub/player/${username.toLowerCase()}`,
    });
    return result.data || result;
  } catch (error) {
    console.error(`Error fetching Chess.com profile for ${username}:`, error.message);
    return null;
  }
};

// Helper function to fetch Chess.com stats
const fetchChessComStats = async (username) => {
  try {
    const result = await chessComApiQueue.request({
      method: "get",
      url: `https://api.chess.com/pub/player/${username.toLowerCase()}/stats`,
    });
    return result.data || result;
  } catch (error) {
    console.error(`Error fetching Chess.com stats for ${username}:`, error.message);
    return null;
  }
};

// Helper function to fetch Chess.com recent games
const fetchChessComRecentGames = async (username) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, "0");

    const response = await chessComApiQueue.request({
      url: `https://api.chess.com/pub/player/${username.toLowerCase()}/games/${currentYear}/${currentMonth}`,
    });

    const games = response.games || response.data?.games || [];
    
    // Get last 10 games and format them, most recent first
    return games
      .slice(-10)
      .reverse()
      .map((game) => {
        const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
        const opponent = isWhite ? game.black : game.white;
        const playerData = isWhite ? game.white : game.black;
        let result = "Draw";
        let ratingChange = "";

        if (game.white.result === "win") {
          result = isWhite ? "Win" : "Loss";
        } else if (game.black.result === "win") {
          result = isWhite ? "Loss" : "Win";
        }

        // Extract rating change if available in result
        if (playerData.result && playerData.result.includes("+")) {
          ratingChange = "+" + playerData.result.split("+")[1];
        } else if (playerData.result && playerData.result.includes("-")) {
          ratingChange = "-" + playerData.result.split("-")[1];
        }

        return {
          id: game.url ? game.url.split("/").pop() : Date.now().toString(),
          opponent: opponent.username,
          opponentRating: opponent.rating,
          result,
          userRating: playerData.rating,
          ratingChange,
          timeControl: game.time_control,
          gameUrl: game.url,
          date: new Date(game.end_time * 1000).toISOString().split("T")[0],
        };
      });
  } catch (error) {
    console.error(`Error fetching Chess.com games for ${username}:`, error.message);
    return [];
  }
};

// Helper function to calculate stats from games
const calculateStatsFromGames = (games, username) => {
  if (!games || games.length === 0) {
    return {
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      currentStreak: 0,
      longestWinStreak: 0,
      averageOpponentRating: 0,
    };
  }

  let wins = 0;
  let losses = 0;
  let draws = 0;
  let currentStreak = 0;
  let longestWinStreak = 0;
  let currentWinStreak = 0;
  let totalOpponentRating = 0;
  let opponentCount = 0;

  games.forEach((game, index) => {
    if (game.result === "Win") {
      wins++;
      currentStreak = currentStreak >= 0 ? currentStreak + 1 : 1;
      currentWinStreak++;
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
    } else if (game.result === "Loss") {
      losses++;
      currentStreak = currentStreak <= 0 ? currentStreak - 1 : -1;
      currentWinStreak = 0;
    } else {
      draws++;
      currentWinStreak = 0;
    }

    if (game.opponentRating) {
      totalOpponentRating += game.opponentRating;
      opponentCount++;
    }
  });

  const totalGames = wins + losses + draws;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const averageOpponentRating = opponentCount > 0 ? Math.round(totalOpponentRating / opponentCount) : 0;

  return {
    totalGames,
    wins,
    losses,
    draws,
    winRate,
    currentStreak,
    longestWinStreak,
    averageOpponentRating,
  };
};

// Helper function to get wallet data
const getWalletData = async (userId) => {
  try {
    // Get current balance
    const balanceResult = await pool.query(
      "SELECT balance FROM users WHERE id = $1",
      [userId]
    );

    // Get recent transactions (last 20)
    const transactionsResult = await pool.query(
      `
      SELECT 
        p.id, 
        p.transaction_type, 
        p.amount, 
        p.status, 
        p.notes, 
        p.created_at, 
        p.request_id,
        p.challenge_id,
        p.opponent_id,
        u.username as opponent_username,
        u.name as opponent_name
      FROM payments p
      LEFT JOIN users u ON p.opponent_id = u.id
      WHERE p.user_id = $1 
      ORDER BY p.created_at DESC 
      LIMIT 20
    `,
      [userId]
    );

    const balance = balanceResult.rows[0]?.balance || 0.0;
    const transactions = transactionsResult.rows;

    // Helper function to determine if transaction is credit or debit
    const getCreditDebitType = (transactionType, notes) => {
      if (transactionType.toLowerCase() === "withdrawal" && notes) {
        if (
          notes.toLowerCase().includes("credited to user balance") ||
          notes.toLowerCase().includes("credited to balance")
        ) {
          return "credit";
        }
      }

      const creditTypes = [
        "deposit", "refund", "balance_credit", "win", "payout", 
        "reward", "bonus", "cashback"
      ];
      const debitTypes = [
        "withdrawal", "bet", "stake", "fee", "charge", "deduction", "spend"
      ];

      const lowerType = transactionType.toLowerCase();

      if (debitTypes.some((type) => lowerType.includes(type))) {
        return "debit";
      }
      if (creditTypes.some((type) => lowerType.includes(type))) {
        return "credit";
      }

      return "credit";
    };

    // Helper function to generate user-friendly description
    const getTransactionDescription = (transactionType, notes, amount, opponentName) => {
      if (notes && notes.trim()) {
        return notes;
      }

      const amountStr = `${parseFloat(amount).toFixed(2)} KSH`;
      const opponentStr = opponentName ? ` vs ${opponentName}` : '';

      switch (transactionType.toLowerCase()) {
        case "deposit":
          return `Deposit${opponentStr} - ${amountStr}`;
        case "refund":
          return `Refund${opponentStr} - withdrawn to M-PESA (${amountStr})`;
        case "payout":
          return `Winnings${opponentStr} - withdrawn to M-PESA (${amountStr})`;
        case "balance_credit":
          return `Winnings${opponentStr} credited to balance (${amountStr})`;
        case "wallet_credit":
          return `Refund${opponentStr} credited to wallet (${amountStr})`;
        case "withdrawal":
          return `Withdrawal to M-PESA (${amountStr})`;
        case "bet":
        case "stake":
          return `Bet placed${opponentStr} - ${amountStr}`;
        case "win":
          return `Match winnings${opponentStr} - ${amountStr}`;
        case "reward":
        case "bonus":
          return `Bonus credited - ${amountStr}`;
        default:
          return `${transactionType} transaction - ${amountStr}`;
      }
    };

    return {
      balance: parseFloat(balance),
      currency: "KES",
      minimumWithdrawal: 10,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: getCreditDebitType(t.transaction_type, t.notes),
        transactionType: t.transaction_type,
        amount: parseFloat(t.amount),
        description: getTransactionDescription(
          t.transaction_type,
          t.notes,
          t.amount,
          t.opponent_name || t.opponent_username
        ),
        referenceId: t.request_id,
        status: t.status,
        date: t.created_at,
        challengeId: t.challenge_id,
        opponent: t.opponent_id ? {
          id: t.opponent_id,
          username: t.opponent_username,
          name: t.opponent_name
        } : null,
      })),
    };
  } catch (error) {
    console.error("Error fetching wallet data:", error);
    return {
      balance: 0,
      currency: "KES",
      minimumWithdrawal: 10,
      transactions: [],
    };
  }
};

// @desc    Get all data for current user (wallet, chess stats, etc.)
// @route   GET /api/users/me/all
// @access  Private
export const getCurrentUserAllData = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    // Get user profile from database
    // Try with all columns first, fallback without current_rating if it doesn't exist
    let userResult;
    try {
      userResult = await pool.query(
        `SELECT id, username, email, name, phone, chess_com_username, lichess_username, 
                preferred_platform, current_rating, balance, created_at 
         FROM users WHERE id = $1`,
        [userId]
      );
    } catch (error) {
      // If current_rating column doesn't exist, retry without it
      if (error.code === '42703' && error.message.includes('current_rating')) {
        console.log("⚠️ [AGGREGATE] current_rating column missing, retrying without it");
        userResult = await pool.query(
          `SELECT id, username, email, name, phone, chess_com_username, lichess_username, 
                  preferred_platform, balance, created_at 
           FROM users WHERE id = $1`,
          [userId]
        );
        // Add default current_rating to the result
        if (userResult.rows.length > 0) {
          userResult.rows[0].current_rating = 1200; // Default rating
        }
      } else {
        throw error;
      }
    }

    if (userResult.rows.length === 0) {
      res.status(404);
      throw new Error("User not found");
    }

    const user = userResult.rows[0];
    
    // Determine which platform username to use
    const platform = user.preferred_platform || 'chess.com';
    const chessUsername = platform === 'chess.com' 
      ? user.chess_com_username 
      : user.lichess_username;

    // Fetch all data in parallel
    const [walletData, chessProfile, chessStats, recentGames, cachedStats] = await Promise.all([
      getWalletData(userId),
      chessUsername ? fetchChessComProfile(chessUsername) : Promise.resolve(null),
      chessUsername ? fetchChessComStats(chessUsername) : Promise.resolve(null),
      chessUsername ? fetchChessComRecentGames(chessUsername) : Promise.resolve([]),
      chessUsername ? userStatsCache.getUserStats(chessUsername, platform).catch(() => null) : Promise.resolve(null),
    ]);

    // Calculate stats from recent games
    const gameStats = calculateStatsFromGames(recentGames, chessUsername);

    // Extract rating from chess.com stats
    let currentRating = user.current_rating || 1200;
    if (chessStats && platform === 'chess.com') {
      const blitzStats = chessStats.chess_blitz || chessStats.chess_rapid || chessStats.chess_bullet;
      if (blitzStats && blitzStats.last && blitzStats.last.rating) {
        currentRating = blitzStats.last.rating;
        
        // Update rating in database if it's different
        if (currentRating !== user.current_rating) {
          await pool.query(
            "UPDATE users SET current_rating = $1, last_rating_update = NOW() WHERE id = $2",
            [currentRating, userId]
          );
        }
      }
    }

    // Prepare response
    const response = {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        phone: user.phone,
        chessComUsername: user.chess_com_username,
        lichessUsername: user.lichess_username,
        preferredPlatform: platform,
        currentRating: currentRating,
        rank: user.rank || "Player",
        country: user.country || "🇰🇪",
      },
      wallet: walletData,
      chessProfile: chessProfile,
      stats: {
        ...gameStats,
        platform: platform,
      },
      recentMatches: recentGames,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching all user data:", error);
    res.status(500);
    throw new Error("Failed to fetch user data");
  }
});

// @desc    Get all data for a specific user
// @route   GET /api/users/:username/all
// @access  Private
export const getUserAllData = asyncHandler(async (req, res) => {
  const { username } = req.params;

  try {
    // Get user profile from database
    const userResult = await pool.query(
      `SELECT id, username, email, name, phone, chess_com_username, lichess_username, 
              preferred_platform, current_rating, created_at 
       FROM users WHERE username = $1`,
      [username]
    );

    if (userResult.rows.length === 0) {
      res.status(404);
      throw new Error("User not found");
    }

    const user = userResult.rows[0];
    
    // Determine which platform username to use
    const platform = user.preferred_platform || 'chess.com';
    const chessUsername = platform === 'chess.com' 
      ? user.chess_com_username 
      : user.lichess_username;

    // Fetch all data in parallel (excluding wallet for privacy)
    const [chessProfile, chessStats, recentGames, cachedStats] = await Promise.all([
      chessUsername ? fetchChessComProfile(chessUsername) : Promise.resolve(null),
      chessUsername ? fetchChessComStats(chessUsername) : Promise.resolve(null),
      chessUsername ? fetchChessComRecentGames(chessUsername) : Promise.resolve([]),
      chessUsername ? userStatsCache.getUserStats(chessUsername, platform).catch(() => null) : Promise.resolve(null),
    ]);

    // Calculate stats from recent games
    const gameStats = calculateStatsFromGames(recentGames, chessUsername);

    // Extract rating from chess.com stats
    let currentRating = user.current_rating || 1200;
    if (chessStats && platform === 'chess.com') {
      const blitzStats = chessStats.chess_blitz || chessStats.chess_rapid || chessStats.chess_bullet;
      if (blitzStats && blitzStats.last && blitzStats.last.rating) {
        currentRating = blitzStats.last.rating;
        
        // Update rating in database if it's different
        if (currentRating !== user.current_rating) {
          await pool.query(
            "UPDATE users SET current_rating = $1, last_rating_update = NOW() WHERE id = $2",
            [currentRating, user.id]
          );
        }
      }
    }

    // Prepare response (no wallet data for other users)
    const response = {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        chessComUsername: user.chess_com_username,
        lichessUsername: user.lichess_username,
        preferredPlatform: platform,
        currentRating: currentRating,
        rank: user.rank || "Player",
        country: user.country || "🇰🇪",
      },
      chessProfile: chessProfile,
      stats: {
        ...gameStats,
        platform: platform,
      },
      recentMatches: recentGames,
      timestamp: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error(`Error fetching all data for user ${username}:`, error);
    res.status(500);
    throw new Error("Failed to fetch user data");
  }
});
