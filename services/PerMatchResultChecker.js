import axios from "axios";
import pool from "../config/database.js";
import paymentService from "./paymentService.js";
import chessComApiQueue from "./ChessComApiQueue.js";
import userStatsCache from "./UserStatsCache.js";

class PerMatchResultChecker {
  constructor() {
    this.activeCheckers = new Map(); // matchId -> { timeoutId, checkCount }
    this.maxChecksPerMatch = 4; // Stop after ~8 minutes of checking (4 * 2 minutes)
    this.checkInterval = 2 * 60 * 1000; // 2 minutes in milliseconds
    this.rateLimitedUntil = null; // Timestamp when rate limiting expires
    this.rateLimitDuration = 5 * 60 * 1000; // 5 minutes in milliseconds
    this.io = null; // Socket.IO instance for notifications
    console.log(
      "🎯 [PER_MATCH_CHECKER] Initialized - Per-match dynamic checking system ready"
    );
  }

  // Set Socket.IO instance for notifications
  setSocketIO(io) {
    this.io = io;
    console.log("🔌 [PER_MATCH_CHECKER] Socket.IO instance set");
  }

  // Start checking a specific match after calculated delay
  startCheckingMatch(matchData) {
    const { matchId, timeControl, startedAt, challenger, opponent, platform } =
      matchData;

    // Calculate match duration based on time control
    const estimatedDuration = this.calculateMatchDuration(timeControl);
    const checkDelay = estimatedDuration * 1000; // Convert to milliseconds

    console.log(
      `⏰ [PER_MATCH_CHECKER] Starting checker for match ${matchId} in ${estimatedDuration} seconds`
    );
    console.log(
      `🎮 [PER_MATCH_CHECKER] ${challenger} vs ${opponent} on ${platform} (${timeControl})`
    );

    // Start checking after estimated match duration
    const timeoutId = setTimeout(() => {
      this.checkMatchResult(matchId, { challenger, opponent, platform }, 0);
    }, checkDelay);

    this.activeCheckers.set(matchId, { timeoutId, checkCount: 0 });
  }

  // Calculate estimated match duration (in seconds)
  calculateMatchDuration(timeControl) {
    if (!timeControl) return 300; // Default 5 minutes

    // Parse time control like "1+1", "3+0", "5+3"
    const match = timeControl.match(/(\d+)\+(\d+)/);
    if (!match) return 300;

    const minutes = parseInt(match[1]);
    const increment = parseInt(match[2]);

    // Estimate: (base_time * 2) + (average_moves * increment * 2)
    // Assume average 30 moves per player
    const estimatedSeconds = minutes * 60 * 2 + 30 * increment * 2;

    console.log(
      `📊 [PER_MATCH_CHECKER] Time control ${timeControl} = ~${estimatedSeconds} seconds`
    );
    return estimatedSeconds;
  }

  // Check if we're currently rate limited
  isRateLimited() {
    if (!this.rateLimitedUntil) return false;

    const now = Date.now();
    if (now < this.rateLimitedUntil) {
      const remainingMs = this.rateLimitedUntil - now;
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return remainingMinutes;
    }

    // Rate limit has expired
    this.rateLimitedUntil = null;
    return false;
  }

  // Set rate limit for 5 minutes
  setRateLimit() {
    this.rateLimitedUntil = Date.now() + this.rateLimitDuration;
    const minutes = this.rateLimitDuration / (60 * 1000);
    const timeString = new Date(this.rateLimitedUntil).toLocaleTimeString();
    console.log(
      `🚫 [PER_MATCH_CHECKER] Rate limited! ALL checks paused for ${minutes} minutes until ${timeString}`
    );
    console.log(
      `🚫 [PER_MATCH_CHECKER] No API calls will be made during this period. Active checkers: ${this.activeCheckers.size}`
    );
  }

  // Recursively check match result every 2 minutes (with complete pause during rate limiting)
  async checkMatchResult(matchId, players, checkCount) {
    if (checkCount >= this.maxChecksPerMatch) {
      console.log(
        `⏰ [PER_MATCH_CHECKER] Max checks (${this.maxChecksPerMatch}) reached for match ${matchId}, initiating auto-refund`
      );

      // Auto-refund both players after max attempts
      await this.handleNoResultFound(matchId, players);

      this.stopCheckingMatch(matchId);
      return;
    }

    // Check if we're rate limited
    const rateLimitRemaining = this.isRateLimited();
    if (rateLimitRemaining) {
      console.log(
        `🚫 [PER_MATCH_CHECKER] Rate limited for ${rateLimitRemaining} more minutes, postponing check for match ${matchId}`
      );

      // Schedule next check AFTER the rate limit expires (no intermediate checks)
      const timeoutId = setTimeout(() => {
        this.checkMatchResult(matchId, players, checkCount);
      }, this.rateLimitedUntil - Date.now() + 1000); // +1 second buffer

      this.activeCheckers.set(matchId, { timeoutId, checkCount });
      return;
    }

    try {
      console.log(
        `🔍 [PER_MATCH_CHECKER] Check #${
          checkCount + 1
        } for match ${matchId}: ${players.challenger} vs ${players.opponent}`
      );

      // Check if match result exists
      const result = await this.checkChessComResult(
        players.challenger,
        players.opponent,
        players.platform
      );

      if (result) {
        console.log(
          `🏆 [PER_MATCH_CHECKER] Match ${matchId} result found:`,
          result
        );
        await this.processMatchResult(matchId, result);
        this.stopCheckingMatch(matchId);
        return;
      }

      console.log(
        `⌛ [PER_MATCH_CHECKER] No result yet for match ${matchId}, will check again in 2 minutes`
      );

      // Schedule next check in 2 minutes
      const timeoutId = setTimeout(() => {
        this.checkMatchResult(matchId, players, checkCount + 1);
      }, this.checkInterval);

      // Update timeout ID for this match
      this.activeCheckers.set(matchId, {
        timeoutId,
        checkCount: checkCount + 1,
      });
    } catch (error) {
      console.error(
        `❌ [PER_MATCH_CHECKER] Error checking match ${matchId}:`,
        error.message
      );

      // Check if this is a rate limiting error - improved detection
      const isRateLimitError =
        (error.response &&
          (error.response.status === 410 || error.response.status === 429)) ||
        (error.code === "ERR_BAD_REQUEST" && error.message.includes("410")) ||
        (error.message && error.message.includes("status code 410")) ||
        (error.message && error.message.includes("status code 429"));

      if (isRateLimitError) {
        const statusCode = error.response?.status || "410";
        console.log(
          `🚫 [PER_MATCH_CHECKER] Rate limiting detected (status ${statusCode}), pausing for 5 minutes`
        );
        this.setRateLimit();

        // Schedule next check AFTER the full rate limit period (no checks during rate limit)
        const timeoutId = setTimeout(() => {
          this.checkMatchResult(matchId, players, checkCount + 1);
        }, this.rateLimitDuration + 1000); // +1 second buffer

        this.activeCheckers.set(matchId, {
          timeoutId,
          checkCount: checkCount + 1,
        });
        return;
      }

      // Continue checking even on other errors (might be temporary API issues)
      const timeoutId = setTimeout(() => {
        this.checkMatchResult(matchId, players, checkCount + 1);
      }, this.checkInterval);

      this.activeCheckers.set(matchId, {
        timeoutId,
        checkCount: checkCount + 1,
      });
    }
  }

  // Check chess.com API for match result
  async checkChessComResult(challenger, opponent, platform) {
    if (platform !== "chess.com") {
      console.log(
        `⚠️ [PER_MATCH_CHECKER] Platform ${platform} not supported for automatic checking`
      );
      return null;
    }

    try {
      // Use queue for API requests instead of axios directly
      console.log(
        `🔍 [PER_MATCH_CHECKER] Fetching game archives for ${challenger}`
      );
      const response = await chessComApiQueue.request(
        {
          method: "get",
          url: `https://api.chess.com/pub/player/${challenger.toLowerCase()}/games/archives`,
        },
        "gameArchives"
      );

      const archives = response.data.archives;

      if (archives.length === 0) return null;

      // Get latest archive (current month)
      const latestArchive = archives[archives.length - 1];

      // Fix the URL to use correct username casing (Chess.com API returns lowercase URLs)
      const correctedArchiveUrl = latestArchive.replace(
        `/player/${challenger.toLowerCase()}/`,
        `/player/${challenger}/`
      );

      console.log(
        `🔍 [PER_MATCH_CHECKER] Fetching games from latest archive: ${correctedArchiveUrl}`
      );

      const gamesResponse = await chessComApiQueue.request(
        {
          method: "get",
          url: correctedArchiveUrl,
        },
        "monthlyGames"
      );

      const games = gamesResponse.data.games;

      // Look for recent game between these players
      const cutoffTime = Date.now() - 30 * 60 * 1000; // Last 30 minutes

      for (const game of games.reverse()) {
        // Check newest first
        const gameTime = game.end_time * 1000;
        if (gameTime < cutoffTime) continue;

        const whitePlayer = game.white.username.toLowerCase();
        const blackPlayer = game.black.username.toLowerCase();

        if (
          (whitePlayer === challenger.toLowerCase() &&
            blackPlayer === opponent.toLowerCase()) ||
          (whitePlayer === opponent.toLowerCase() &&
            blackPlayer === challenger.toLowerCase())
        ) {
          return {
            winner: this.determineWinner(game, challenger, opponent),
            result: this.determineGameResult(game),
            gameUrl: game.url,
            endTime: new Date(gameTime),
            gameData: {
              white: game.white.username,
              black: game.black.username,
              whiteResult: game.white.result,
              blackResult: game.black.result,
            },
          };
        }
      }

      return null;
    } catch (error) {
      // Check if this is a rate limiting error that should be thrown up
      const isRateLimitError =
        (error.response &&
          (error.response.status === 410 || error.response.status === 429)) ||
        (error.code === "ERR_BAD_REQUEST" && error.message.includes("410")) ||
        (error.message && error.message.includes("status code 410")) ||
        (error.message && error.message.includes("status code 429")) ||
        (error.message && error.message.includes("rate limited"));

      if (isRateLimitError) {
        console.error(
          "❌ [PER_MATCH_CHECKER] Chess.com API error:",
          error.message
        );
        // Throw rate limiting errors so they can be handled by main checkMatchResult method
        throw error;
      }

      // For other errors, log and return null
      console.error(
        "❌ [PER_MATCH_CHECKER] Chess.com API error:",
        error.message
      );
      return null;
    }
  }

  determineWinner(game, challenger, opponent) {
    const challengerColor =
      game.white.username.toLowerCase() === challenger.toLowerCase()
        ? "white"
        : "black";
    const challengerResult =
      challengerColor === "white" ? game.white.result : game.black.result;
    const opponentResult =
      challengerColor === "white" ? game.black.result : game.white.result;

    console.log(
      `🎯 [WINNER_DEBUG] Challenger: ${challenger} (${challengerColor}) = ${challengerResult}`
    );
    console.log(`🎯 [WINNER_DEBUG] Opponent: ${opponent} = ${opponentResult}`);

    if (challengerResult === "win") return challenger;
    if (opponentResult === "win") return opponent;

    // Check for draw conditions
    if (
      (challengerResult === "agreed" && opponentResult === "agreed") ||
      challengerResult === "stalemate" ||
      opponentResult === "stalemate" ||
      challengerResult === "repetition" ||
      opponentResult === "repetition" ||
      challengerResult === "insufficient" ||
      opponentResult === "insufficient"
    ) {
      return "draw";
    }

    // If someone has 'lose', the other should have 'win'
    if (challengerResult === "lose") return opponent;
    if (opponentResult === "lose") return challenger;

    console.log(
      `⚠️ [WINNER_DEBUG] Unclear result: challenger=${challengerResult}, opponent=${opponentResult}`
    );
    return "draw";
  }

  determineGameResult(game) {
    // Determine the primary result type based on how the game ended
    const whiteResult = game.white.result;
    const blackResult = game.black.result;

    // If someone won by timeout, resignation, etc., use that as the result
    if (whiteResult === "timeout" || blackResult === "timeout")
      return "timeout";
    if (whiteResult === "resigned" || blackResult === "resigned")
      return "resigned";
    if (whiteResult === "checkmated" || blackResult === "checkmated")
      return "checkmated";
    if (whiteResult === "abandoned" || blackResult === "abandoned")
      return "abandoned";
    if (whiteResult === "agreed" && blackResult === "agreed") return "agreed";
    if (whiteResult === "stalemate" || blackResult === "stalemate")
      return "stalemate";
    if (whiteResult === "repetition" || blackResult === "repetition")
      return "repetition";
    if (whiteResult === "insufficient" || blackResult === "insufficient")
      return "insufficient";

    // Default to 'win' if someone actually won
    if (whiteResult === "win" || blackResult === "win") return "win";

    // Fallback
    return "unknown";
  }

  async processMatchResult(matchId, result) {
    try {
      console.log(
        `💰 [PER_MATCH_CHECKER] Processing result for match ${matchId}:`,
        result
      );

      // Get match and challenge data
      const matchQuery = await pool.query(
        `
        SELECT om.*, c.bet_amount, c.challenger_phone, c.opponent_phone, c.challenger, c.opponent, c.platform,
               CASE 
                 WHEN c.platform = 'chess.com' THEN cu.chess_com_username 
                 WHEN c.platform = 'lichess' THEN cu.lichess_username 
                 ELSE cu.username 
               END as challenger_username,
               CASE 
                 WHEN c.platform = 'chess.com' THEN ou.chess_com_username 
                 WHEN c.platform = 'lichess' THEN ou.lichess_username 
                 ELSE ou.username 
               END as opponent_username
        FROM ongoing_matches om
        JOIN challenges c ON om.challenge_id = c.id
        JOIN users cu ON c.challenger = cu.id
        JOIN users ou ON c.opponent = ou.id
        WHERE om.id = $1
      `,
        [matchId]
      );

      if (matchQuery.rows.length === 0) {
        console.log(
          `❌ [PER_MATCH_CHECKER] No match data found for match ${matchId}`
        );
        return;
      }

      const match = matchQuery.rows[0];

      // Convert result format to get winner_id
      const paymentResult = this.convertResultForPayment(result, match);

      // Process payment if it's a bet match
      if (match.bet_amount && match.bet_amount > 0) {
        console.log(
          `💳 [PER_MATCH_CHECKER] Processing payment for bet match ${matchId} (amount: ${match.bet_amount})`
        );

        await paymentService.processMatchResult(paymentResult, match);
      } else {
        console.log(
          `ℹ️ [PER_MATCH_CHECKER] Match ${matchId} has no bet amount, result logged but no payment processing`
        );
      }

      // Mark match as completed with winner_id and result
      await pool.query(
        `
        UPDATE ongoing_matches 
        SET result_checked = true, 
            match_result = $1, 
            winner_id = $2, 
            result = $3,
            completed_at = NOW()
        WHERE id = $4
      `,
        [
          JSON.stringify(result),
          paymentResult.winner_id,
          paymentResult.result,
          matchId,
        ]
      );

      // Invalidate cache for both players (match completed, need fresh stats)
      userStatsCache.invalidateOngoingMatchCache(
        match.challenger,
        match.platform
      );
      userStatsCache.invalidateOngoingMatchCache(
        match.opponent,
        match.platform
      );

      console.log(
        `✅ [PER_MATCH_CHECKER] Match ${matchId} processed and marked complete`
      );
    } catch (error) {
      console.error(
        `❌ [PER_MATCH_CHECKER] Error processing match result:`,
        error
      );
    }
  }

  // Convert chess.com result format to payment service format
  convertResultForPayment(chessResult, match) {
    const { winner, result: gameResult, gameData } = chessResult;

    // Map winner username to user ID
    let winnerId = null;
    let loserId = null;

    if (winner === "draw") {
      // It's a draw, no winner/loser
      winnerId = null;
      loserId = null;
    } else if (winner === match.challenger_username) {
      winnerId = match.challenger;
      loserId = match.opponent;
    } else if (winner === match.opponent_username) {
      winnerId = match.opponent;
      loserId = match.challenger;
    }

    return {
      result: gameResult, // 'abandoned', 'checkmated', 'resigned', etc.
      winner_id: winnerId,
      loser_id: loserId,
      game_url: chessResult.gameUrl,
      game_data: gameData,
    };
  }

  stopCheckingMatch(matchId) {
    const checker = this.activeCheckers.get(matchId);
    if (checker) {
      clearTimeout(checker.timeoutId);
      this.activeCheckers.delete(matchId);
      console.log(`🛑 [PER_MATCH_CHECKER] Stopped checking match ${matchId}`);
    }
  }

  // Manual stop for specific match (can be called from API)
  manualStopCheck(matchId) {
    console.log(
      `👤 [PER_MATCH_CHECKER] Manual stop requested for match ${matchId}`
    );
    this.stopCheckingMatch(matchId);
  }

  // Get status of all active checkers
  getStatus() {
    const activeMatches = Array.from(this.activeCheckers.entries()).map(
      ([matchId, data]) => ({
        matchId,
        checkCount: data.checkCount,
        maxChecks: this.maxChecksPerMatch,
        remainingChecks: this.maxChecksPerMatch - data.checkCount,
      })
    );

    return {
      activeCheckers: activeMatches.length,
      matches: activeMatches,
      totalMemoryUsage: `~${activeMatches.length * 50} bytes`,
    };
  }

  // Clean up all checkers (for shutdown)
  cleanup() {
    console.log(
      `🧹 [PER_MATCH_CHECKER] Cleaning up ${this.activeCheckers.size} active checkers`
    );
    for (const [matchId, checker] of this.activeCheckers) {
      clearTimeout(checker.timeoutId);
    }
    this.activeCheckers.clear();
    console.log("✅ [PER_MATCH_CHECKER] All match checkers cleaned up");
  }

  // Handle case when no result is found after max attempts - Auto refund both players
  async handleNoResultFound(matchId, players) {
    try {
      console.log(
        `💰 [PER_MATCH_CHECKER] No result found for match ${matchId} after ${this.maxChecksPerMatch} attempts`
      );
      console.log(
        `💰 [PER_MATCH_CHECKER] Processing auto-refund for: ${players.challenger} vs ${players.opponent}`
      );

      // Get match details including challenge_id
      const matchQuery = `
        SELECT om.*, c.bet_amount, c.challenger, c.opponent, 
               c.challenger_phone, c.opponent_phone
        FROM ongoing_matches om
        JOIN challenges c ON om.challenge_id = c.id
        WHERE om.id = $1
      `;

      const matchResult = await pool.query(matchQuery, [matchId]);

      if (matchResult.rows.length === 0) {
        console.error(
          `❌ [PER_MATCH_CHECKER] Match ${matchId} not found in database`
        );
        return;
      }

      const match = matchResult.rows[0];
      const betAmount = parseFloat(match.bet_amount || 0);

      if (betAmount === 0) {
        console.log(
          `ℹ️ [PER_MATCH_CHECKER] Match ${matchId} had no bet, no refund needed`
        );
        await pool.query(
          `UPDATE ongoing_matches 
           SET result_checked = TRUE, 
               result = 'no_result_no_bet',
               notes = 'No result found after ${this.maxChecksPerMatch} attempts. No bet amount to refund.',
               completed_at = NOW()
           WHERE id = $1`,
          [matchId]
        );
        return;
      }

      console.log(
        `💵 [PER_MATCH_CHECKER] Refunding ${betAmount} KSH to each player`
      );

      // Refund logic: >10 KSH = M-Pesa, <=10 KSH = wallet credit
      if (betAmount > 10) {
        // M-Pesa refund for both players
        console.log(
          `📱 [PER_MATCH_CHECKER] Amount > 10 KSH, initiating M-Pesa refunds`
        );

        await paymentService.initiateWithdrawal(
          match.challenger_phone,
          betAmount,
          match.challenger,
          match.challenge_id,
          true // isRefund = true
        );

        await paymentService.initiateWithdrawal(
          match.opponent_phone,
          betAmount,
          match.opponent,
          match.challenge_id,
          true // isRefund = true
        );

        console.log(
          `✅ [PER_MATCH_CHECKER] M-Pesa refunds initiated for both players`
        );
      } else {
        // Wallet credit for both players (<=10 KSH)
        console.log(
          `💰 [PER_MATCH_CHECKER] Amount ≤ 10 KSH, crediting to wallets`
        );

        // Credit challenger's wallet
        await pool.query(
          `UPDATE users 
           SET balance = balance + $1, 
               updated_at = NOW() 
           WHERE id = $2`,
          [betAmount, match.challenger]
        );

        // Credit opponent's wallet
        await pool.query(
          `UPDATE users 
           SET balance = balance + $1, 
               updated_at = NOW() 
           WHERE id = $2`,
          [betAmount, match.opponent]
        );

        // Record wallet credits in payments table
        await pool.query(
          `INSERT INTO payments 
           (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id, notes) 
           VALUES 
           ($1, $2, $3, $4, 'refund', 'completed', $5, $6),
           ($7, $2, $8, $4, 'refund', 'completed', $9, $6)`,
          [
            match.challenger,
            match.challenge_id,
            match.challenger_phone,
            betAmount,
            `REFUND_WALLET_${match.challenge_id}_${
              match.challenger
            }_${Date.now()}`,
            `No result found after ${this.maxChecksPerMatch} attempts. Amount credited to wallet.`,
            match.opponent,
            match.opponent_phone,
            `REFUND_WALLET_${match.challenge_id}_${
              match.opponent
            }_${Date.now()}`,
          ]
        );

        console.log(
          `✅ [PER_MATCH_CHECKER] Wallet credits completed for both players`
        );
      }

      // Mark match as completed with no result
      await pool.query(
        `UPDATE ongoing_matches 
         SET result_checked = TRUE, 
             result = 'no_result_refunded',
             match_result = $2,
             completed_at = NOW()
         WHERE id = $1`,
        [
          matchId,
          JSON.stringify({
            status: "no_result",
            refund_type: betAmount > 10 ? "mpesa" : "wallet",
            amount_refunded: betAmount,
            reason: `Match result not found after ${this.maxChecksPerMatch} check attempts`,
            note: `No result found after ${this.maxChecksPerMatch} attempts. Both players refunded.`,
          }),
        ]
      );

      console.log(
        `✅ [PER_MATCH_CHECKER] Match ${matchId} marked as completed with auto-refund`
      );

      // Emit socket events to both players
      if (this.io) {
        const refundMessage =
          betAmount > 10
            ? `Your ${betAmount} KSH bet has been refunded to M-Pesa due to match timeout.`
            : `Your ${betAmount} KSH bet has been credited to your wallet due to match timeout.`;

        console.log(
          `🔔 [PER_MATCH_CHECKER] Emitting matchRefunded to players ${match.challenger} and ${match.opponent}`
        );

        this.io.to(match.challenger.toString()).emit("matchRefunded", {
          matchId,
          challengeId: match.challenge_id,
          amount: betAmount,
          refundType: betAmount > 10 ? "mpesa" : "wallet",
          message: refundMessage,
          timestamp: new Date().toISOString(),
        });

        this.io.to(match.opponent.toString()).emit("matchRefunded", {
          matchId,
          challengeId: match.challenge_id,
          amount: betAmount,
          refundType: betAmount > 10 ? "mpesa" : "wallet",
          message: refundMessage,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(
        `❌ [PER_MATCH_CHECKER] Error handling no result for match ${matchId}:`,
        error.message
      );
      console.error(error.stack);
    }
  }
}

const perMatchChecker = new PerMatchResultChecker();
export default perMatchChecker;
