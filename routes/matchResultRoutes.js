import express from 'express';
import pool from '../config/database.js';
import OngoingMatch from '../models/OngoingMatch.js';
import https from 'https';
import paymentController from '../controllers/paymentController.js';

const router = express.Router();

// Report match result endpoint
router.post('/report-result', async (req, res) => {
  try {
    const { challengeId, result, gameUrl, reporterId } = req.body;
    
    console.log(`🎯 [${new Date().toISOString()}] Match result reported:`, {
      challengeId,
      result,
      gameUrl,
      reporterId
    });

    // 1. Find the ongoing match
    const ongoingMatch = await OngoingMatch.findByChallenge(challengeId);
    if (!ongoingMatch) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // 2. Verify the reporter is part of this match
    if (reporterId !== ongoingMatch.challenger_id && reporterId !== ongoingMatch.opponent_id) {
      return res.status(403).json({ error: 'Not authorized to report this match result' });
    }

    // 3. Determine winner/loser based on who reported
    let winnerId = null;
    let loserId = null;
    let winnerUsername = null;
    let loserUsername = null;

    if (result === 'win') {
      winnerId = reporterId;
      winnerUsername = reporterId === ongoingMatch.challenger_id ? 
        ongoingMatch.challenger_username : ongoingMatch.opponent_username;
      loserId = reporterId === ongoingMatch.challenger_id ? 
        ongoingMatch.opponent_id : ongoingMatch.challenger_id;
      loserUsername = reporterId === ongoingMatch.challenger_id ? 
        ongoingMatch.opponent_username : ongoingMatch.challenger_username;
    } else if (result === 'loss') {
      loserId = reporterId;
      winnerId = reporterId === ongoingMatch.challenger_id ? 
        ongoingMatch.opponent_id : ongoingMatch.challenger_id;
      winnerUsername = reporterId === ongoingMatch.challenger_id ? 
        ongoingMatch.opponent_username : ongoingMatch.challenger_username;
      loserUsername = reporterId === ongoingMatch.challenger_id ? 
        ongoingMatch.challenger_username : ongoingMatch.opponent_username;
    }
    // For draw, both winner and loser remain null

    // 4. Verify game URL if provided
    let gameUrlVerified = false;
    if (gameUrl) {
      gameUrlVerified = await verifyGameUrl(gameUrl, ongoingMatch.challenger_username, ongoingMatch.opponent_username);
      console.log(`🔍 Game URL verification: ${gameUrlVerified ? 'PASSED' : 'FAILED'}`);
    }

    // 5. Save match result to database
    const insertResult = await pool.query(`
      INSERT INTO match_results (
        challenge_id, winner_id, loser_id, result, platform, 
        game_url, match_date, reported_by, url_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8)
      RETURNING *
    `, [
      challengeId,
      winnerId,
      loserId,
      result,
      ongoingMatch.platform,
      gameUrl || null,
      reporterId,
      gameUrlVerified
    ]);

    // 6. Mark ongoing match as checked
    await OngoingMatch.markResultChecked(ongoingMatch.id, winnerId, result);

    // 7. Update challenge status
    await pool.query(`UPDATE challenges SET status = 'completed' WHERE id = $1`, [challengeId]);

    // 8. Process payment payout if this is a payment challenge
    await processPaymentForManualResult(challengeId, result, ongoingMatch);

    // 9. Send victory notification if there's a winner
    if (winnerId && result !== 'draw') {
      const io = req.app.get('io');
      const notificationData = {
        message: `Chequemate! You won against ${loserUsername}!`,
        opponent: loserUsername,
        platform: ongoingMatch.platform,
        gameUrl: gameUrl || null
      };

      io.to(winnerId.toString()).emit('victory-notification', notificationData);
      
      console.log(`🎉 Victory notification sent to ${winnerUsername} (ID: ${winnerId})`);
    }

    console.log(`✅ Match result processed successfully!`);
    
    res.json({
      success: true,
      result: insertResult.rows[0],
      message: 'Match result recorded successfully!',
      verified: gameUrlVerified
    });

  } catch (error) {
    console.error('❌ Error reporting match result:', error);
    res.status(500).json({ error: 'Failed to report match result' });
  }
});

// Verify game URL contains both players
async function verifyGameUrl(gameUrl, player1, player2) {
  return new Promise((resolve) => {
    try {
      // Extract game info from URL
      let apiUrl = null;
      
      if (gameUrl.includes('chess.com')) {
        // Extract game ID from Chess.com URL
        const gameIdMatch = gameUrl.match(/chess\.com\/game\/live\/(\d+)/);
        if (gameIdMatch) {
          apiUrl = `https://api.chess.com/pub/game/${gameIdMatch[1]}`;
        }
      } else if (gameUrl.includes('lichess.org')) {
        // Extract game ID from Lichess URL
        const gameIdMatch = gameUrl.match(/lichess\.org\/(\w+)/);
        if (gameIdMatch) {
          apiUrl = `https://lichess.org/api/game/${gameIdMatch[1]}`;
        }
      }

      if (!apiUrl) {
        console.log('🔍 Could not extract game ID from URL');
        resolve(false);
        return;
      }

      // Make API request to verify
      const req = https.request(apiUrl, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const gameData = JSON.parse(data);
            
            // Check if both players are in the game
            let foundPlayer1 = false;
            let foundPlayer2 = false;
            
            if (gameUrl.includes('chess.com')) {
              foundPlayer1 = gameData.white?.username?.toLowerCase() === player1.toLowerCase() || 
                           gameData.black?.username?.toLowerCase() === player1.toLowerCase();
              foundPlayer2 = gameData.white?.username?.toLowerCase() === player2.toLowerCase() || 
                           gameData.black?.username?.toLowerCase() === player2.toLowerCase();
            } else if (gameUrl.includes('lichess.org')) {
              foundPlayer1 = gameData.players?.white?.user?.name?.toLowerCase() === player1.toLowerCase() || 
                           gameData.players?.black?.user?.name?.toLowerCase() === player1.toLowerCase();
              foundPlayer2 = gameData.players?.white?.user?.name?.toLowerCase() === player2.toLowerCase() || 
                           gameData.players?.black?.user?.name?.toLowerCase() === player2.toLowerCase();
            }

            resolve(foundPlayer1 && foundPlayer2);
          } catch (e) {
            console.log('🔍 Error parsing game data for verification');
            resolve(false);
          }
        });
      });

      req.on('error', () => resolve(false));
      req.setTimeout(5000, () => {
        req.destroy();
        resolve(false);
      });
      req.end();

    } catch (error) {
      resolve(false);
    }
  });
}

// Process payment for manually reported results
async function processPaymentForManualResult(challengeId, result, ongoingMatch) {
  try {
    console.log(`💰 Processing payment for manually reported result: ${result}`);

    // Get challenge details including payment info
    const challengeQuery = await pool.query(`
      SELECT c.*, 
             challenger_user.username as challenger_username, challenger_user.phone as challenger_phone,
             opponent_user.username as opponent_username, opponent_user.phone as opponent_phone
      FROM challenges c
      JOIN users challenger_user ON c.challenger = challenger_user.id
      JOIN users opponent_user ON c.opponent = opponent_user.id
      WHERE c.id = $1
    `, [challengeId]);

    if (challengeQuery.rows.length === 0) {
      console.log(`Challenge ${challengeId} not found for payment processing`);
      return;
    }

    const challenge = challengeQuery.rows[0];

    if (!challenge.bet_amount || challenge.bet_amount <= 0) {
      console.log(`No payment amount for challenge ${challengeId}, skipping payment processing`);
      return;
    }

    console.log(`Processing payment for challenge ${challengeId} with bet amount: ${challenge.bet_amount}`);

    // Prepare challenger and opponent data
    const challengerData = {
      id: challenge.challenger,
      username: challenge.challenger_username,
      phone: challenge.challenger_phone
    };

    const opponentData = {
      id: challenge.opponent,
      username: challenge.opponent_username,
      phone: challenge.opponent_phone
    };

    // Convert manual result format to payment system format
    let paymentResult = result;
    if (result === 'loss') {
      // If reporter reported loss, they lost, so opponent won
      paymentResult = 'resigned';
    } else if (result === 'win') {
      // If reporter reported win, they won
      paymentResult = 'win';
    } else if (result === 'draw') {
      paymentResult = 'stalemate';
    }

    console.log(`Initiating payment payout with result: ${paymentResult}`);

    // Process the game payout
    await paymentController.processGamePayout(
      ongoingMatch.id, // gameId
      paymentResult,
      challengerData,
      opponentData
    );

    console.log(`Payment payout processing completed for challenge ${challengeId}`);

  } catch (error) {
    console.error(`Error processing payment for manual result:`, error);
    // Don't throw - continue with result processing even if payment fails
  }
}

export default router;
