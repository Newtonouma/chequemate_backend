import axios from "axios";
import pool from "../config/database.js";
import tokenManager from "./tokenManager.js";
import dotenv from "dotenv";

dotenv.config();

// Constants from .env
const DEFAULT_DESTINATION_ACCOUNT = process.env.ONIT_ACCOUNT || "0001650000002";
const CHANNEL = process.env.CHANNEL || "MPESA";
const PRODUCT = process.env.PRODUCT || "CA05";
const HOST = process.env.ONIT_HOST || "api.onitmfbank.com";

// Helper function to normalize phone numbers to +254 format
function normalizePhoneNumber(phone) {
  if (!phone) return null;

  // Remove all spaces, dashes, and parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");

  // If it starts with +254, it's already correct
  if (cleaned.startsWith("+254")) {
    return cleaned;
  }

  // If it starts with 254, add the +
  if (cleaned.startsWith("254")) {
    return "+" + cleaned;
  }

  // If it starts with 0, replace with +254
  if (cleaned.startsWith("0")) {
    return "+254" + cleaned.substring(1);
  }

  // If it's just 9 digits (no prefix), add +254
  if (cleaned.length === 9 && /^\d+$/.test(cleaned)) {
    return "+254" + cleaned;
  }

  // Return as-is if we can't figure it out
  console.warn(`⚠️ Could not normalize phone number: ${phone}`);
  return cleaned;
}

class PaymentService {
  constructor() {
    this.initialized = false;
    // Simple in-memory request queue to serialize payment API calls
    this.queue = [];
    this.processing = false;
    this.initializeToken();
  }

  async initializeToken() {
    try {
      this.initialized = await tokenManager.initialize();
      console.log(
        `💰 Payment service ${
          this.initialized ? "initialized successfully" : "failed to initialize"
        }`
      );
    } catch (error) {
      console.error("Payment service initialization error:", error);
      this.initialized = false;
    }
  }

  // Enqueue a task that will run with a fresh auth token; tasks are processed sequentially
  enqueueRequest(taskName, taskFn) {
    return new Promise((resolve, reject) => {
      const job = { taskName, taskFn, resolve, reject };
      this.queue.push(job);
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { taskName, taskFn, resolve, reject } = this.queue.shift();
      try {
        // Always fetch a fresh token for each queued request
        const accessToken = await tokenManager.refreshToken();
        const result = await taskFn(accessToken);
        resolve(result);
      } catch (err) {
        console.error(`❌ [QUEUE] Task failed (${taskName}):`, err?.response?.data || err?.message || err);
        reject(err);
      }
    }

    this.processing = false;
  }

  async initiateDeposit(phoneNumber, amount, userId, challengeId) {
    try {
      // Normalize phone number to +254 format
      const normalizedPhone = normalizePhoneNumber(phoneNumber);

      console.log("🏬 [DEPOSIT] Starting deposit initiation:", {
        phoneNumber: normalizedPhone,
        originalPhone: phoneNumber,
        amount,
        challengeId,
        userId,
        timestamp: new Date().toISOString(),
      });

      // DEBUG: Check input types and values
      console.log("🔍 [DEPOSIT] Input parameter debug:", {
        phoneNumber: { value: phoneNumber, type: typeof phoneNumber },
        amount: { value: amount, type: typeof amount },
        userId: { value: userId, type: typeof userId },
        challengeId: { value: challengeId, type: typeof challengeId },
      });

      // Convert to proper types safely
      const numericUserId = Number(userId);
      const numericChallengeId = Number(challengeId);
      const numericAmount = Number(amount);
      
      // Get opponent information from challenge
      let opponentId = null;
      try {
        const challengeQuery = await pool.query(
          'SELECT challenger, opponent FROM challenges WHERE id = $1',
          [numericChallengeId]
        );
        if (challengeQuery.rows.length > 0) {
          const challenge = challengeQuery.rows[0];
          opponentId = challenge.challenger === numericUserId 
            ? challenge.opponent 
            : challenge.challenger;
        }
      } catch (err) {
        console.warn('⚠️ [DEPOSIT] Could not fetch opponent info:', err.message);
      }

      console.log("🔢 [DEPOSIT] Converted values:", {
        numericUserId,
        numericChallengeId,
        numericAmount,
        userIdIsNaN: isNaN(numericUserId),
        challengeIdIsNaN: isNaN(numericChallengeId),
        amountIsNaN: isNaN(numericAmount),
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
      console.log("🆔 [DEPOSIT] Generated request ID:", requestId);

      // First record in database
      const paymentData = {
        user_id: numericUserId,
        challenge_id: numericChallengeId,
        phone_number: normalizedPhone,
        amount: numericAmount, // Store as numeric value
        transaction_type: "deposit",
        status: "pending",
        request_id: requestId,
        opponent_id: opponentId,
      };

      console.log(`💾 [DEPOSIT] Payment data to insert:`, paymentData);

      const query = `INSERT INTO payments 
        (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id, opponent_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`;

      const result = await pool.query(query, [
        paymentData.user_id,
        paymentData.challenge_id,
        paymentData.phone_number,
        paymentData.amount,
        paymentData.transaction_type,
        paymentData.status,
        paymentData.request_id,
        paymentData.opponent_id,
      ]);

      // CRITICAL NEW PART: Make the actual API call via serialized queue with fresh auth
      const apiData = await this.enqueueRequest("deposit", async (accessToken) => {
        const url = `https://${HOST}/api/v1/transaction/deposit`;
        console.log(`🔗 Deposit URL: ${url}`);

        const apiResponse = await axios.post(
          url,
          {
            originatorRequestId: requestId,
            destinationAccount: DEFAULT_DESTINATION_ACCOUNT,
            sourceAccount: normalizedPhone,
            amount: Math.round(numericAmount),
            channel: CHANNEL,
            product: PRODUCT,
            event: "",
            narration: `Get a cheque, mate ${numericChallengeId}`,
            callbackUrl:
              process.env.ONIT_CALLBACK_URL ||
              "https://chequemate-backend-n13g.onrender.com/api/payments/callback",
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        console.log(`✅ [DEPOSIT] API Response:`, apiResponse.data);

        // Update payment record with transaction ID if provided by API
        if (apiResponse.data && apiResponse.data.transactionId) {
          await pool.query(
            `UPDATE payments SET transaction_id = $1 WHERE request_id = $2`,
            [apiResponse.data.transactionId, requestId]
          );
        }

        return apiResponse.data;
      });

      return {
        success: true,
        data: result.rows[0],
        apiResponse: apiData,
      };
    } catch (error) {
      console.error(
        "❌ [DEPOSIT] Error initiating deposit:",
        error.response?.data || error.message || error
      );

      // Update payment record to failed if API call failed
      if (error.response) {
        try {
          await pool.query(
            `UPDATE payments SET status = 'failed', notes = $1 WHERE request_id = $2`,
            [JSON.stringify(error.response.data), requestId]
          );
        } catch (dbError) {
          console.error("Failed to update payment status:", dbError);
        }
      }

      return { success: false, error: error.message };
    }
  }

  async initiateWithdrawal(
    phoneNumber,
    amount,
    userId,
    challengeId,
    isRefund = false
  ) {
    try {
      // Normalize phone number to +254 format
      const normalizedPhone = normalizePhoneNumber(phoneNumber);

      console.log(
        `💰 [WITHDRAW] Initiating ${
          isRefund ? "refund" : "payout"
        } of KSH ${amount} to ${normalizedPhone} (original: ${phoneNumber})`
      );

      // Validate user_id and challengeId are valid numbers
      const numericUserId = parseInt(userId);
      const numericChallengeId = parseInt(challengeId);
      const numericAmount = Number(amount);
      
      // Get opponent information from challenge
      let opponentId = null;
      try {
        const challengeQuery = await pool.query(
          'SELECT challenger, opponent FROM challenges WHERE id = $1',
          [numericChallengeId]
        );
        if (challengeQuery.rows.length > 0) {
          const challenge = challengeQuery.rows[0];
          opponentId = challenge.challenger === numericUserId 
            ? challenge.opponent 
            : challenge.challenger;
        }
      } catch (err) {
        console.warn('⚠️ [WITHDRAW] Could not fetch opponent info:', err.message);
      }

      if (isNaN(numericUserId)) {
        throw new Error(`Invalid userId: ${userId}`);
      }
      if (isNaN(numericChallengeId)) {
        throw new Error(`Invalid challengeId: ${challengeId}`);
      }
      if (isNaN(numericAmount)) {
        throw new Error(`Invalid amount: ${amount}`);
      }

      if (!normalizedPhone) {
        throw new Error(`Invalid phone number: ${phoneNumber}`);
      }

      // Check minimum payout amount for M-Pesa (KES 10)
      const MINIMUM_PAYOUT = 10;
      if (numericAmount < MINIMUM_PAYOUT) {
        console.log(
          `⚠️ [WITHDRAW] Amount ${numericAmount} is below minimum ${MINIMUM_PAYOUT}, crediting to user balance instead`
        );

        // Instead of M-Pesa withdrawal, credit to user's platform balance
        // Record as "balance_credit" type so it shows as GREEN in wallet (money IN)
        const requestId = `${
          isRefund ? "REF" : "BAL"
        }_${numericChallengeId}_${numericUserId}_${Date.now()}`;

        const paymentData = {
          user_id: numericUserId,
          challenge_id: numericChallengeId,
          phone_number: normalizedPhone,
          amount: numericAmount,
          transaction_type: isRefund ? "refund" : "balance_credit", // GREEN: money going INTO wallet
          status: "completed",
          request_id: requestId,
          opponent_id: opponentId,
          notes: isRefund
            ? `Refund credited to balance (below ${MINIMUM_PAYOUT} KSH minimum)`
            : `Winnings credited to balance (below ${MINIMUM_PAYOUT} KSH minimum)`,
        };

        const query = `INSERT INTO payments 
          (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id, notes, opponent_id) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;

        const result = await pool.query(query, [
          paymentData.user_id,
          paymentData.challenge_id,
          paymentData.phone_number,
          paymentData.amount,
          paymentData.transaction_type,
          paymentData.status,
          paymentData.request_id,
          paymentData.notes,
          paymentData.opponent_id,
        ]);

        // Actually credit the user's balance
        await pool.query(
          `UPDATE users 
           SET balance = balance + $1, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $2`,
          [numericAmount, numericUserId]
        );

        console.log(
          `✅ [WITHDRAW] Small amount credited to user balance: ${numericAmount} KSH (User ID: ${numericUserId})`
        );
        return {
          success: true,
          data: result.rows[0],
          credited_to_balance: true,
        };
      }

      // Generate unique request ID
      const requestId = `${
        isRefund ? "REF" : "PAY"
      }_${numericChallengeId}_${numericUserId}_${Date.now()}`;

      // Record in database with descriptive notes
      const paymentData = {
        user_id: numericUserId,
        challenge_id: numericChallengeId,
        phone_number: normalizedPhone,
        amount: numericAmount,
        transaction_type: isRefund ? "refund" : "payout",
        status: "pending",
        request_id: requestId,
        opponent_id: opponentId,
        notes: isRefund
          ? `Refund - withdrawn to M-PESA (${numericAmount} KSH)`
          : `Winnings - withdrawn to M-PESA (${numericAmount} KSH)`,
      };

      const query = `INSERT INTO payments 
        (user_id, challenge_id, phone_number, amount, transaction_type, status, request_id, notes, opponent_id) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`;

      const result = await pool.query(query, [
        paymentData.user_id,
        paymentData.challenge_id,
        paymentData.phone_number,
        paymentData.amount,
        paymentData.transaction_type,
        paymentData.status,
        paymentData.request_id,
        paymentData.notes,
        paymentData.opponent_id,
      ]);

      // Make the actual API call via serialized queue with fresh auth
      const apiData = await this.enqueueRequest("withdraw", async (accessToken) => {
        const url = `https://${HOST}/api/v1/transaction/withdraw`;
        console.log(`🔗 Withdraw URL: ${url}`);

        const apiResponse = await axios.post(
          url,
          {
            originatorRequestId: requestId,
            sourceAccount: DEFAULT_DESTINATION_ACCOUNT,
            destinationAccount: normalizedPhone,
            amount: Math.round(Number(amount)), // Convert to integer as specified
            channel: CHANNEL,
            channelType: "MOBILE",
            product: "CA04",
            narration: `Chess Nexus ${
              isRefund ? "refund" : "winnings"
            } - Game ${challengeId}`,
            callbackUrl:
              process.env.ONIT_CALLBACK_URL ||
              "https://chequemate-backend-n13g.onrender.com/api/payments/callback",
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        console.log(`✅ [WITHDRAW] API Response:`, apiResponse.data);

        // Update payment record with transaction ID
        if (apiResponse.data && apiResponse.data.transactionId) {
          await pool.query(
            `UPDATE payments SET transaction_id = $1 WHERE request_id = $2`,
            [apiResponse.data.transactionId, requestId]
          );
        }

        return apiResponse.data;
      });

      return {
        success: true,
        data: result.rows[0],
        apiResponse: apiData,
      };
    } catch (error) {
      console.error(
        "❌ [WITHDRAW] Error:",
        error.response?.data || error.message || error
      );
      return { success: false, error: error.message };
    }
  }

  // Process match result and handle payouts
  async processMatchResult(matchResult, challenge) {
    try {
      // Get challenger and opponent info
      const { challenger, opponent, bet_amount, challenge_id } = challenge;

      if (!bet_amount || bet_amount <= 0) {
        console.log(
          "No bet amount for this challenge, skipping payment processing"
        );
        return { success: true, message: "No payment to process" };
      }

      if (!challenge.challenger_phone || !challenge.opponent_phone) {
        console.error("Missing phone numbers for payment processing");
        return { success: false, error: "Missing phone numbers" };
      }

      // Use the correct challenge_id from the match data
      const actualChallengeId = challenge_id || challenge.id;

      // Logic based on result type
      const resultType = matchResult.result;
      const winnerId = matchResult.winner_id;

      // Draw cases - refund both players
      const drawResults = [
        "insufficient",
        "timevsinsufficient",
        "repetition",
        "threefold_repetition",
        "stalemate",
        "agreed",
        "fifty_move",
        "aborted",
      ];

      if (drawResults.includes(resultType)) {
        console.log(
          `🤝 Match ended in draw (${resultType}), refunding both players`
        );

        // Refund both players
        await this.initiateWithdrawal(
          challenge.challenger_phone,
          bet_amount,
          challenger,
          actualChallengeId,
          true
        );
        await this.initiateWithdrawal(
          challenge.opponent_phone,
          bet_amount,
          opponent,
          actualChallengeId,
          true
        );

        return { success: true, message: "Both players refunded" };
      }

      // Win cases - payout to winner
      // Determine winner
      let winnerPhone, winnerUserId;
      if (resultType === "win") {
        // Direct win
        winnerPhone =
          matchResult.winner_id === challenger
            ? challenge.challenger_phone
            : challenge.opponent_phone;
        winnerUserId = matchResult.winner_id;
      } else if (
        [
          "resigned",
          "timeout",
          "checkmated",
          "abandoned",
          "adjudication",
          "rule_violation",
        ].includes(resultType)
      ) {
        // Determine winner by who didn't lose
        const loserId = matchResult.loser_id;
        winnerPhone =
          loserId === challenger
            ? challenge.opponent_phone
            : challenge.challenger_phone;
        winnerUserId = loserId === challenger ? opponent : challenger;
      } else {
        // Unknown result - treat as draw
        console.log(`🤔 Unknown result type "${resultType}", treating as draw`);
        await this.initiateWithdrawal(
          challenge.challenger_phone,
          bet_amount,
          challenger,
          actualChallengeId,
          true
        );
        await this.initiateWithdrawal(
          challenge.opponent_phone,
          bet_amount,
          opponent,
          actualChallengeId,
          true
        );
        return {
          success: true,
          message: "Both players refunded (unknown result)",
        };
      }

      // Pay double the bet amount to winner (their bet + opponent's bet)
      const winAmount = bet_amount * 2;
      console.log(
        `🏆 Winner determined: ${winnerUserId}, paying out ${winAmount}`
      );
      await this.initiateWithdrawal(
        winnerPhone,
        winAmount,
        winnerUserId,
        actualChallengeId,
        false
      );

      return { success: true, message: `Winner paid out: ${winAmount}` };
    } catch (error) {
      console.error("Error processing match result payment:", error);
      return { success: false, error: error.message };
    }
  }
}

const paymentService = new PaymentService();
export default paymentService;
