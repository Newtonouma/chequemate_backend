import asyncHandler from 'express-async-handler';
import fetch from 'node-fetch';
import Challenge from '../models/Challenge.js';
import User from '../models/User.js';
import pool from '../config/database.js';
import paymentController from './paymentController.js';

const CHESS_COM_API = 'https://api.chess.com/pub';
const LICHESS_API = 'https://lichess.org/api';

async function validatePlayer(username, platform) {
  let res, name;
  if (platform === 'chess.com') {
    name = 'Chess.com';
    res = await fetch(`${CHESS_COM_API}/player/${username.toLowerCase()}`);
  } else {
    name = 'Lichess.org';
    res = await fetch(`${LICHESS_API}/user/${username}`);
  }

  if (res.status === 200) {
    return { valid: true, data: await res.json() };
  }
  if (res.status === 404) {
    return { valid: false, error: `Player "${username}" not found on ${name}` };
  }
  return { valid: false, error: `Error ${res.status} checking "${username}" on ${name}` };
}

export const createMatch = asyncHandler(async (req, res) => {
  const { challengerName, opponentName, platform } = req.body;

  if (!challengerName || !opponentName || !platform) {
    res.status(400);
    throw new Error('challengerName, opponentName and platform are required');
  }
  if (challengerName.toLowerCase() === opponentName.toLowerCase()) {
    res.status(400);
    throw new Error('Challenger and opponent must be different');
  }

  const challengerUser = await User.findByUsername(challengerName);
  const opponentUser = await User.findByUsername(opponentName);

  if (!challengerUser || !opponentUser) {
    res.status(404);
    throw new Error('One or both users not found');
  }

  const createdChallenge = await Challenge.create({
    challenger: challengerUser.id,
    opponent: opponentUser.id,
    platform,
  });

  const io = req.app.get('socketio');
  io.to(opponentUser.id.toString()).emit('newChallenge', createdChallenge);

  res.status(201).json(createdChallenge);
});

export const getChallenges = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const challenges = await Challenge.findByUserId(userId);
  res.json(challenges);
});


export const validatePlayerController = asyncHandler(async (req, res) => {
  const { username, platform } = req.body;
  if (!username || !platform) {
    res.status(400);
    throw new Error('username and platform are required');
  }
  const result = await validatePlayer(username, platform);
  res.json(result);
});

export const acceptChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  const { opponentPhoneNumber, paymentDetails } = req.body;
  
  try {
    // Get the challenge details first
    const query = `
      SELECT c.*, 
             challenger_user.username as challenger_username, challenger_user.phone as challenger_phone,
             opponent_user.username as opponent_username, opponent_user.phone as opponent_phone
      FROM challenges c
      JOIN users challenger_user ON c.challenger = challenger_user.id
      JOIN users opponent_user ON c.opponent = opponent_user.id
      WHERE c.id = $1
    `;
    
    const challengeResult = await pool.query(query, [challengeId]);
    
    if (challengeResult.rows.length === 0) {
      res.status(404);
      throw new Error('Challenge not found');
    }

    const challenge = challengeResult.rows[0];

    // Update challenge status to accepted and save opponent phone
    // Use provided phone number or fall back to user's profile phone
    const finalOpponentPhone = opponentPhoneNumber || challenge.opponent_phone;
    
    let updateQuery, updateParams;
    
    if (finalOpponentPhone) {
      updateQuery = `
        UPDATE challenges 
        SET status = $1, opponent_phone = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *;
      `;
      updateParams = ['accepted', finalOpponentPhone, challengeId];
      console.log(`📱 [CHALLENGE_ACCEPT] Saving opponent phone: ${finalOpponentPhone} for challenge ${challengeId}`);
    } else {
      updateQuery = `
        UPDATE challenges 
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *;
      `;
      updateParams = ['accepted', challengeId];
      console.log(`⚠️ [CHALLENGE_ACCEPT] No opponent phone available for challenge ${challengeId}`);
    }
    
    const updateResult = await pool.query(updateQuery, updateParams);
    const updatedChallenge = updateResult.rows[0];
    
    if (!updatedChallenge) {
      res.status(404);
      throw new Error('Challenge not found');
    }
    
    console.log(`✅ [CHALLENGE_ACCEPT] Challenge ${challengeId} updated:`, {
      status: updatedChallenge.status,
      opponentPhone: updatedChallenge.opponent_phone
    });

    // If this is a payment challenge, initiate deposits for both players
    if (challenge.bet_amount && challenge.bet_amount > 0) {
      console.log(`💳 [CHALLENGE_ACCEPT] This is a payment challenge with bet amount: ${challenge.bet_amount}`);
      try {
        // Get phone numbers
        const challengerPhone = paymentDetails?.phoneNumber || challenge.challenger_phone;
        const opponentPhone = finalOpponentPhone;

        console.log(`📞 [CHALLENGE_ACCEPT] Phone numbers:`, {
          challengerPhone,
          opponentPhone,
          paymentDetailsPhone: paymentDetails?.phoneNumber,
          challengerDbPhone: challenge.challenger_phone,
          opponentDbPhone: challenge.opponent_phone,
          providedOpponentPhone: opponentPhoneNumber
        });

        if (!challengerPhone || !opponentPhone) {
          console.error(`❌ [CHALLENGE_ACCEPT] Missing phone numbers:`, {
            challengerPhone: !!challengerPhone,
            opponentPhone: !!opponentPhone
          });
          throw new Error('Phone numbers required for payment challenges');
        }

        // Initiate deposit for challenger
        const challengerDepositReq = {
          body: {
            phoneNumber: challengerPhone,
            amount: challenge.bet_amount,
            challengeId: challengeId,
            userId: challenge.challenger
          }
        };

        // Initiate deposit for opponent
        const opponentDepositReq = {
          body: {
            phoneNumber: opponentPhone,
            amount: challenge.bet_amount,
            challengeId: challengeId,
            userId: challenge.opponent
          }
        };

        // Use a mock response object for internal calls
        const mockRes = {
          json: (data) => data,
          status: (code) => ({ json: (data) => data })
        };

        console.log(`🚀 [CHALLENGE_ACCEPT] Payment initiation will be handled by app.js game-redirect events`);

        // Update challenge payment status
        await pool.query(
          'UPDATE challenges SET payment_status = $1 WHERE id = $2',
          ['pending', challengeId]
        );

      } catch (paymentError) {
        console.error('Error initiating payments:', paymentError);
        // Continue with challenge acceptance even if payment fails
        // The payment can be retried later
      }
    }

    // Get the full challenge details with user info for notification
    const challenges = await Challenge.findByUserId(updatedChallenge.challenger);
    const fullChallenge = challenges.find(c => c.id == challengeId);
    
    if (fullChallenge) {
      const io = req.app.get('socketio');
      
      const notificationData = {
        challengeId,
        challengerId: fullChallenge.challenger.id,
        challengerUsername: fullChallenge.challenger.username,
        accepterUsername: fullChallenge.opponent.username,
        challenge: fullChallenge,
        hasPayment: challenge.bet_amount > 0,
        paymentAmount: challenge.bet_amount
      };
      
      // Notify the challenger that their challenge was accepted
      io.to(fullChallenge.challenger.id.toString()).emit('challengeAccepted', notificationData);
    }

    res.json({ 
      success: true, 
      message: 'Challenge accepted', 
      challenge: fullChallenge || updatedChallenge,
      hasPayment: challenge.bet_amount > 0,
      paymentAmount: challenge.bet_amount
    });
  } catch (error) {
    console.error('Error accepting challenge:', error);
    res.status(500);
    throw new Error('Failed to accept challenge');
  }
});

export const declineChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  
  try {
    const updatedChallenge = await Challenge.updateStatus(challengeId, 'declined');
    
    if (!updatedChallenge) {
      res.status(404);
      throw new Error('Challenge not found');
    }

    res.json({ 
      success: true, 
      message: 'Challenge declined', 
      challenge: updatedChallenge 
    });
  } catch (error) {
    res.status(500);
    throw new Error('Failed to decline challenge');
  }
});

export const cancelChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  
  try {
    const updatedChallenge = await Challenge.updateStatus(challengeId, 'cancelled');
    
    if (!updatedChallenge) {
      res.status(404);
      throw new Error('Challenge not found');
    }

    res.json({ 
      success: true, 
      message: 'Challenge cancelled', 
      challenge: updatedChallenge 
    });
  } catch (error) {
    res.status(500);
    throw new Error('Failed to cancel challenge');
  }
});

export const postponeChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  
  try {
    const updatedChallenge = await Challenge.updateStatus(challengeId, 'postponed');
    
    if (!updatedChallenge) {
      res.status(404);
      throw new Error('Challenge not found');
    }

    res.json({ 
      success: true, 
      message: 'Challenge postponed', 
      challenge: updatedChallenge 
    });
  } catch (error) {
    res.status(500);
    throw new Error('Failed to postpone challenge');
  }
});

export const deleteChallenge = asyncHandler(async (req, res) => {
  const { challengeId } = req.params;
  
  try {
    // First check if challenge exists
    const query = 'DELETE FROM challenges WHERE id = $1 RETURNING *';
    const result = await pool.query(query, [challengeId]);
    
    if (result.rows.length === 0) {
      res.status(404);
      throw new Error('Challenge not found');
    }

    res.json({ 
      success: true, 
      message: 'Challenge deleted' 
    });
  } catch (error) {
    res.status(500);
    throw new Error('Failed to delete challenge');
  }
});