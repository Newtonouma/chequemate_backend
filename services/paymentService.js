import axios from 'axios';
import pool from '../config/database.js';
import tokenManager from './tokenManager.js';
import dotenv from 'dotenv';

dotenv.config();

// Constants from .env
const DEFAULT_DESTINATION_ACCOUNT = process.env.ONIT_ACCOUNT || '0001650000002';
const CHANNEL = process.env.CHANNEL || 'MPESA';
const PRODUCT = process.env.PRODUCT || 'CA05';
const HOST = process.env.ONIT_HOST || 'api.onitmfbank.com';

class PaymentService {
  constructor() {
    this.initialized = false;
    this.initializeToken();
  }

  async initializeToken() {
    try {
      this.initialized = await tokenManager.initialize();
      console.log(`💰 Payment service ${this.initialized ? 'initialized successfully' : 'failed to initialize'}`);
    } catch (error) {
      console.error('Payment service initialization error:', error);
      this.initialized = false;
    }
  }

  async initiateDeposit(phoneNumber, amount, userId, challengeId) {
    try {
      console.log('🏦 [DEPOSIT] Starting deposit initiation:', {
        phoneNumber,
        amount,
        challengeId,
        userId,
        timestamp: new Date().toISOString()
      });
      
      // DEBUG: Check input types and values
      console.log('🔍 [DEPOSIT] Input parameter debug:', {
        phoneNumber: { value: phoneNumber, type: typeof phoneNumber },
        amount: { value: amount, type: typeof amount },
        userId: { value: userId, type: typeof userId },
        challengeId: { value: challengeId, type: typeof challengeId }
      });
      
      // Convert to proper types safely
      const numericUserId = Number(userId);
      const numericChallengeId = Number(challengeId);
      const numericAmount = Number(amount);
      
      console.log('🔢 [DEPOSIT] Converted values:', {
        numericUserId,
        numericChallengeId,
        numericAmount,
        userIdIsNaN: isNaN(numericUserId),
        challengeIdIsNaN: isNaN(numericChallengeId),
        amountIsNaN: isNaN(numericAmount)
      });
      
      // Validate conversions
      if (isNaN(numericUserId)) {
        throw new Error(`Invalid userId: ${userId}`);
      }
      if (isNaN(numericChallengeId)) {
        throw new Error(`Invalid challengeId: ${challengeId}`);
      }
      if (isNaN(numericAmount)) {
        throw new Error(`Invalid amount: ${amount}`);
      }
      
      // Generate unique request ID
      const requestId = `DEP_${numericChallengeId}_${numericUserId}_${Date.now()}`;
      console.log('🆔 [DEPOSIT] Generated request ID:', requestId);

      // First record in database
      const paymentData = {
        user_id: numericUserId,
        challenge_id: numericChallengeId,
        phone_number: phoneNumber,
        amount: numericAmount, // Store as numeric value
        transaction_type: 'deposit',
        status: 'pending',
        request_id: requestId
      };
      
      console.log(`💾 [DEPOSIT] Payment data to insert:`, paymentData);
      
      const query = `INSERT INTO payments 
        (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
        
      const result = await pool.query(query, [
        paymentData.user_id,
        paymentData.challenge_id,
        paymentData.phone_number,
        paymentData.amount,
        paymentData.transaction_type,
        paymentData.status,
        paymentData.request_id
      ]);
      
      // CRITICAL NEW PART: Make the actual API call
      const accessToken = await tokenManager.getToken();
      
      if (!accessToken) {
        console.error('❌ [DEPOSIT] Failed to get access token for payment API');
        return { success: false, error: 'Authentication failed' };
      }
      
      console.log(`🔑 [DEPOSIT] Got access token, making API call to initiate deposit`);
      
      const url = `https://${HOST}/api/v1/transaction/deposit`;
      console.log(`🔗 Deposit URL: ${url}`);
      
      // Make the actual API call to payment provider - EXACTLY as in deposit.js
      const apiResponse = await axios.post(url, {
        originatorRequestId: requestId,
        destinationAccount: DEFAULT_DESTINATION_ACCOUNT,
        sourceAccount: phoneNumber,
        amount: Math.round(numericAmount), // Convert to integer as specified
        channel: CHANNEL,
        product: PRODUCT,
        event: '',
        narration: `Get a cheque, mate ${numericChallengeId}`,
        callbackUrl: process.env.ONIT_CALLBACK_URL || "https://chequemate.space/onit/deposit/callback"
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log(`✅ [DEPOSIT] API Response:`, apiResponse.data);
      
      // Update payment record with transaction ID if provided by API
      if (apiResponse.data && apiResponse.data.transactionId) {
        await pool.query(`UPDATE payments SET transaction_id = $1 WHERE request_id = $2`, 
          [apiResponse.data.transactionId, requestId]);
      }
      
      return { success: true, data: result.rows[0], apiResponse: apiResponse.data };
    } catch (error) {
      console.error('❌ [DEPOSIT] Error initiating deposit:', error.response?.data || error.message || error);
      
      // Update payment record to failed if API call failed
      if (error.response) {
        try {
          await pool.query(`UPDATE payments SET status = 'failed', notes = $1 WHERE request_id = $2`, 
            [JSON.stringify(error.response.data), requestId]);
        } catch (dbError) {
          console.error('Failed to update payment status:', dbError);
        }
      }
      
      return { success: false, error: error.message };
    }
  }

  async initiateWithdrawal(phoneNumber, amount, userId, challengeId, isRefund = false) {
    try {
      console.log(`💰 [WITHDRAW] Initiating ${isRefund ? 'refund' : 'payout'} of KSH ${amount} to ${phoneNumber}`);
      
      // Validate user_id and challengeId are valid numbers
      const numericUserId = parseInt(userId);
      const numericChallengeId = parseInt(challengeId);
      const numericAmount = Number(amount);
      
      if (isNaN(numericUserId)) {
        throw new Error(`Invalid userId: ${userId}`);
      }
      if (isNaN(numericChallengeId)) {
        throw new Error(`Invalid challengeId: ${challengeId}`);
      }
      if (isNaN(numericAmount)) {
        throw new Error(`Invalid amount: ${amount}`);
      }
      
      // Check minimum payout amount for M-Pesa (KES 10)
      const MINIMUM_PAYOUT = 10;
      if (numericAmount < MINIMUM_PAYOUT) {
        console.log(`⚠️ [WITHDRAW] Amount ${numericAmount} is below minimum ${MINIMUM_PAYOUT}, crediting to user balance instead`);
        
        // Instead of M-Pesa withdrawal, credit to user's platform balance
        // TODO: Implement user balance system in future
        // For now, just record the pending credit
        const requestId = `${isRefund ? 'REF' : 'BAL'}_${numericChallengeId}_${numericUserId}_${Date.now()}`;
        
        const paymentData = {
          user_id: numericUserId,
          challenge_id: numericChallengeId,
          phone_number: phoneNumber,
          amount: numericAmount,
          transaction_type: 'balance_credit',
          status: 'completed',
          request_id: requestId,
          notes: `Amount below minimum payout (${MINIMUM_PAYOUT}), credited to user balance`
        };
        
        const query = `INSERT INTO payments 
          (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id, notes) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;
        
        const result = await pool.query(query, [
          paymentData.user_id,
          paymentData.challenge_id,
          paymentData.phone_number,
          paymentData.amount,
          paymentData.transaction_type,
          paymentData.status,
          paymentData.request_id,
          paymentData.notes
        ]);
        
        console.log(`✅ [WITHDRAW] Small amount credited to user balance: ${numericAmount} KSH`);
        return { success: true, data: result.rows[0], credited_to_balance: true };
      }
      
      // Generate unique request ID
      const requestId = `${isRefund ? 'REF' : 'PAY'}_${numericChallengeId}_${numericUserId}_${Date.now()}`;
      
      // Record in database
      const paymentData = {
        user_id: numericUserId,
        challenge_id: numericChallengeId,
        phone_number: phoneNumber,
        amount: numericAmount,
        transaction_type: isRefund ? 'refund' : 'payout',
        status: 'pending',
        request_id: requestId
      };
      
      const query = `INSERT INTO payments 
        (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`;
      
      const result = await pool.query(query, [
        paymentData.user_id,
        paymentData.challenge_id,
        paymentData.phone_number,
        paymentData.amount,
        paymentData.transaction_type,
        paymentData.status,
        paymentData.request_id
      ]);
      
      // Get access token
      const accessToken = await tokenManager.getToken();
      
      if (!accessToken) {
        console.error('❌ [WITHDRAW] Failed to get access token for payment API');
        return { success: false, error: 'Authentication failed' };
      }
      
      const url = `https://${HOST}/api/v1/transaction/withdraw`;
      console.log(`🔗 Withdraw URL: ${url}`);
      
      // Make the actual API call - EXACTLY as in withdraw.js
      const apiResponse = await axios.post(url, {
        originatorRequestId: requestId,
        sourceAccount: DEFAULT_DESTINATION_ACCOUNT,
        destinationAccount: phoneNumber,
        amount: Math.round(Number(amount)), // Convert to integer as specified
        channel: CHANNEL,
        channelType: 'MOBILE',
        product: 'CA04',
        narration: `Chess Nexus ${isRefund ? 'refund' : 'winnings'} - Game ${challengeId}`,
        callbackUrl: process.env.ONIT_CALLBACK_URL || "https://chequemate.space/onit/deposit/callback"
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log(`✅ [WITHDRAW] API Response:`, apiResponse.data);
      
      // Update payment record with transaction ID
      if (apiResponse.data && apiResponse.data.transactionId) {
        await pool.query(`UPDATE payments SET transaction_id = $1 WHERE request_id = $2`, 
          [apiResponse.data.transactionId, requestId]);
      }
      
      return { success: true, data: result.rows[0], apiResponse: apiResponse.data };
    } catch (error) {
      console.error('❌ [WITHDRAW] Error:', error.response?.data || error.message || error);
      return { success: false, error: error.message };
    }
  }
  
  // Process match result and handle payouts
  async processMatchResult(matchResult, challenge) {
    try {
      // Get challenger and opponent info
      const { challenger, opponent, bet_amount, challenge_id } = challenge;
      
      if (!bet_amount || bet_amount <= 0) {
        console.log('No bet amount for this challenge, skipping payment processing');
        return { success: true, message: 'No payment to process' };
      }
      
      if (!challenge.challenger_phone || !challenge.opponent_phone) {
        console.error('Missing phone numbers for payment processing');
        return { success: false, error: 'Missing phone numbers' };
      }
      
      // Use the correct challenge_id from the match data
      const actualChallengeId = challenge_id || challenge.id;
      
      // Logic based on result type
      const resultType = matchResult.result;
      const winnerId = matchResult.winner_id;
      
      // Draw cases - refund both players
      const drawResults = ['insufficient', 'timevsinsufficient', 'repetition', 'threefold_repetition',
        'stalemate', 'agreed', 'fifty_move', 'aborted'];
        
      if (drawResults.includes(resultType)) {
        console.log(`🤝 Match ended in draw (${resultType}), refunding both players`);
        
        // Refund both players
        await this.initiateWithdrawal(challenge.challenger_phone, bet_amount, challenger, actualChallengeId, true);
        await this.initiateWithdrawal(challenge.opponent_phone, bet_amount, opponent, actualChallengeId, true);
        
        return { success: true, message: 'Both players refunded' };
      }
      
      // Win cases - payout to winner
      // Determine winner
      let winnerPhone, winnerUserId;
      if (resultType === 'win') {
        // Direct win
        winnerPhone = matchResult.winner_id === challenger ? challenge.challenger_phone : challenge.opponent_phone;
        winnerUserId = matchResult.winner_id;
      } else if (['resigned', 'timeout', 'checkmated', 'abandoned', 'adjudication', 'rule_violation'].includes(resultType)) {
        // Determine winner by who didn't lose
        const loserId = matchResult.loser_id;
        winnerPhone = loserId === challenger ? challenge.opponent_phone : challenge.challenger_phone;
        winnerUserId = loserId === challenger ? opponent : challenger;
      } else {
        // Unknown result - treat as draw
        console.log(`🤔 Unknown result type "${resultType}", treating as draw`);
        await this.initiateWithdrawal(challenge.challenger_phone, bet_amount, challenger, actualChallengeId, true);
        await this.initiateWithdrawal(challenge.opponent_phone, bet_amount, opponent, actualChallengeId, true);
        return { success: true, message: 'Both players refunded (unknown result)' };
      }
      
      // Pay double the bet amount to winner (their bet + opponent's bet)
      const winAmount = bet_amount * 2;
      console.log(`🏆 Winner determined: ${winnerUserId}, paying out ${winAmount}`);
      await this.initiateWithdrawal(winnerPhone, winAmount, winnerUserId, actualChallengeId, false);
      
      return { success: true, message: `Winner paid out: ${winAmount}` };
    } catch (error) {
      console.error('Error processing match result payment:', error);
      return { success: false, error: error.message };
    }
  }
}

const paymentService = new PaymentService();
export default paymentService;