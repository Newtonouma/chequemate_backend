import pool from "../config/database.js";
import paymentService from "./paymentService.js";

// Socket.IO instance (set from app.js)
let io = null;

class PaymentTimeoutChecker {
  constructor() {
    this.checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    this.partialPaymentTimeout = 5 * 60 * 1000; // 5 minutes
    this.fullExpiryTimeout = 5 * 60 * 1000; // 5 minutes
    this.minWithdrawalAmount = 10; // Minimum KES for M-Pesa withdrawal
  }

  setSocketIO(socketIO) {
    io = socketIO;
    console.log("✅ [PAYMENT_TIMEOUT] Socket.IO instance set");
  }

  async start() {
    console.log("🕐 [PAYMENT_TIMEOUT] Starting payment timeout checker...");
    console.log(
      `⏰ [PAYMENT_TIMEOUT] Checking every ${this.checkInterval / 1000 / 60} minutes`
    );
    console.log(
      `⚠️ [PAYMENT_TIMEOUT] Partial payment timeout: ${this.partialPaymentTimeout / 1000 / 60} minutes`
    );
    console.log(
      `❌ [PAYMENT_TIMEOUT] Full expiry timeout: ${this.fullExpiryTimeout / 1000 / 60} minutes`
    );

    // Run immediately on start
    await this.checkExpiredPayments();

    // Then run periodically
    setInterval(() => {
      this.checkExpiredPayments();
    }, this.checkInterval);
  }

  async checkExpiredPayments() {
    try {
      console.log("🔍 [PAYMENT_TIMEOUT] Checking for expired payments...");

      // Get all accepted challenges with payments
      const challengesQuery = `
        SELECT 
          c.id,
          c.challenger,
          c.opponent,
          c.bet_amount,
          c.status,
          c.payment_status,
          c.created_at,
          c.updated_at,
          cu.username as challenger_username,
          ou.username as opponent_username
        FROM challenges c
        JOIN users cu ON c.challenger = cu.id
        JOIN users ou ON c.opponent = ou.id
        WHERE c.status = 'accepted'
        AND c.bet_amount > 0
        AND c.payment_status != 'completed'
      `;

      const challenges = await pool.query(challengesQuery);

      for (const challenge of challenges.rows) {
        await this.processExpiredChallenge(challenge);
      }

      console.log(
        `✅ [PAYMENT_TIMEOUT] Checked ${challenges.rows.length} challenges`
      );
    } catch (error) {
      console.error("❌ [PAYMENT_TIMEOUT] Error checking expired payments:", error);
    }
  }

  async processExpiredChallenge(challenge) {
    const now = new Date();
    const acceptedAt = new Date(challenge.updated_at);
    const timeSinceAccepted = now - acceptedAt;

    // Check payment status for both users
    const paymentsQuery = `
      SELECT user_id, status, amount
      FROM payments
      WHERE challenge_id = $1
      AND transaction_type = 'deposit'
      ORDER BY created_at DESC
    `;

    const payments = await pool.query(paymentsQuery, [challenge.id]);
    const completedPayments = payments.rows.filter((p) => p.status === "completed");
    const pendingPayments = payments.rows.filter((p) => p.status === "pending");

    console.log(
      `📊 [PAYMENT_TIMEOUT] Challenge ${challenge.id}: ${completedPayments.length}/2 payments completed, time elapsed: ${Math.round(timeSinceAccepted / 1000 / 60)} minutes`
    );

    // Case 1: One user paid, other didn't (partial payment) - after 15 minutes
    if (
      completedPayments.length === 1 &&
      timeSinceAccepted > this.partialPaymentTimeout
    ) {
      console.log(
        `⚠️ [PAYMENT_TIMEOUT] Partial payment timeout for challenge ${challenge.id} - refunding paying user`
      );
      await this.handlePartialPaymentTimeout(challenge, completedPayments[0]);
    }

    // Case 2: Neither user paid - after 30 minutes
    else if (
      completedPayments.length === 0 &&
      timeSinceAccepted > this.fullExpiryTimeout
    ) {
      console.log(
        `❌ [PAYMENT_TIMEOUT] Full expiry timeout for challenge ${challenge.id} - cancelling`
      );
      await this.handleFullExpiry(challenge);
    }

    // Case 3: Both users paid - this shouldn't happen but handle it
    else if (completedPayments.length === 2) {
      console.log(
        `✅ [PAYMENT_TIMEOUT] Challenge ${challenge.id} has both payments - updating status`
      );
      await pool.query(
        "UPDATE challenges SET payment_status = 'completed' WHERE id = $1",
        [challenge.id]
      );
    }
  }

  async handlePartialPaymentTimeout(challenge, payment) {
    try {
      // Determine opponent
      const opponentId = challenge.challenger === payment.user_id 
        ? challenge.opponent 
        : challenge.challenger;
      
      // Refund the user who paid
      await this.processRefund(
        payment.user_id,
        payment.amount,
        challenge.id,
        "partial_payment_timeout",
        opponentId
      );

      // Cancel the challenge
      await pool.query(
        `UPDATE challenges 
         SET status = 'cancelled', 
             payment_status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [challenge.id]
      );

      // Mark failed/pending payments as cancelled
      await pool.query(
        `UPDATE payments 
         SET status = 'cancelled'
         WHERE challenge_id = $1 
         AND status IN ('pending', 'failed')`,
        [challenge.id]
      );

      // Notify both users
      if (io) {
        const paidUserId = payment.user_id;
        const unpaidUserId =
          challenge.challenger === paidUserId
            ? challenge.opponent
            : challenge.challenger;

        io.to(paidUserId.toString()).emit("challenge-expired", {
          challengeId: challenge.id,
          reason: "opponent_no_payment",
          refunded: true,
          message:
            "Opponent didn't complete payment. Your deposit has been refunded.",
        });

        io.to(unpaidUserId.toString()).emit("challenge-expired", {
          challengeId: challenge.id,
          reason: "payment_timeout",
          refunded: false,
          message: "Challenge expired - payment deadline passed.",
        });
      }

      console.log(
        `✅ [PAYMENT_TIMEOUT] Refunded user ${payment.user_id} for challenge ${challenge.id}`
      );
    } catch (error) {
      console.error(
        `❌ [PAYMENT_TIMEOUT] Error handling partial payment timeout:`,
        error
      );
    }
  }

  async handleFullExpiry(challenge) {
    try {
      // Cancel the challenge
      await pool.query(
        `UPDATE challenges 
         SET status = 'cancelled', 
             payment_status = 'failed',
             updated_at = NOW()
         WHERE id = $1`,
        [challenge.id]
      );

      // Mark all pending payments as cancelled
      await pool.query(
        `UPDATE payments 
         SET status = 'cancelled'
         WHERE challenge_id = $1 
         AND status IN ('pending', 'failed')`,
        [challenge.id]
      );

      // Notify both users
      if (io) {
        io.to(challenge.challenger.toString()).emit("challenge-expired", {
          challengeId: challenge.id,
          reason: "full_expiry",
          message: "Challenge expired - neither player completed payment.",
        });

        io.to(challenge.opponent.toString()).emit("challenge-expired", {
          challengeId: challenge.id,
          reason: "full_expiry",
          message: "Challenge expired - neither player completed payment.",
        });
      }

      console.log(`✅ [PAYMENT_TIMEOUT] Expired challenge ${challenge.id}`);
    } catch (error) {
      console.error(`❌ [PAYMENT_TIMEOUT] Error handling full expiry:`, error);
    }
  }

  async processRefund(userId, amount, challengeId, reason, opponentId = null) {
    try {
      const numericAmount = parseFloat(amount);

      console.log(
        `💰 [REFUND] Processing refund: ${numericAmount} KES to user ${userId}`
      );

      // Smart refund logic
      if (numericAmount >= this.minWithdrawalAmount) {
        // M-Pesa withdrawal for amounts >= 10 KES
        console.log(
          `📱 [REFUND] Amount >= ${this.minWithdrawalAmount} KES - initiating M-Pesa withdrawal`
        );
        await this.initiateWithdrawal(userId, numericAmount, challengeId, reason, opponentId);
      } else {
        // Add to wallet for amounts < 10 KES
        console.log(
          `💼 [REFUND] Amount < ${this.minWithdrawalAmount} KES - adding to wallet`
        );
        await this.addToWallet(userId, numericAmount, challengeId, reason, opponentId);
      }
    } catch (error) {
      console.error(`❌ [REFUND] Error processing refund:`, error);
      throw error;
    }
  }

  async initiateWithdrawal(userId, amount, challengeId, reason, opponentId = null) {
    try {
      // Get user's phone number
      const userQuery = await pool.query("SELECT phone FROM users WHERE id = $1", [
        userId,
      ]);

      if (userQuery.rows.length === 0) {
        throw new Error(`User ${userId} not found`);
      }

      const phoneNumber = userQuery.rows[0].phone;

      if (!phoneNumber) {
        // If no phone number, add to wallet instead
        console.warn(
          `⚠️ [REFUND] No phone number for user ${userId}, adding to wallet instead`
        );
        await this.addToWallet(userId, amount, challengeId, reason, opponentId);
        return;
      }

      // Create withdrawal payment record
      const requestId = `REF_${challengeId}_${userId}_${Date.now()}`;

      const insertQuery = `
        INSERT INTO payments (
          user_id, challenge_id, phone_number, amount, 
          transaction_type, request_id, status, opponent_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      await pool.query(insertQuery, [
        userId,
        challengeId,
        phoneNumber,
        amount,
        "withdrawal",
        requestId,
        "pending",
        opponentId,
      ]);

      // Initiate M-Pesa withdrawal via payment service
      const withdrawalResult = await paymentService.initiateWithdrawal(
        phoneNumber,
        amount,
        requestId
      );

      // Notify user
      if (io) {
        io.to(userId.toString()).emit("refund-initiated", {
          amount,
          method: "mpesa",
          phoneNumber,
          message: `Refund of ${amount} KES is being sent to your M-Pesa.`,
        });
      }

      console.log(
        `✅ [REFUND] M-Pesa withdrawal initiated for user ${userId}: ${amount} KES`
      );
    } catch (error) {
      console.error(`❌ [REFUND] Withdrawal failed:`, error);
      // Fallback to wallet
      console.log(`🔄 [REFUND] Falling back to wallet credit`);
      await this.addToWallet(userId, amount, challengeId, reason, opponentId);
    }
  }

  async addToWallet(userId, amount, challengeId, reason, opponentId = null) {
    try {
      // Get user's phone number
      const userQuery = await pool.query("SELECT phone FROM users WHERE id = $1", [
        userId,
      ]);
      
      const phoneNumber = userQuery.rows[0]?.phone || null;

      // Update user's wallet balance with column existence check
      let newBalance = 0;
      try {
        const updateQuery = `
          UPDATE users 
          SET balance = COALESCE(balance, 0) + $1
          WHERE id = $2
          RETURNING balance
        `;

        const result = await pool.query(updateQuery, [amount, userId]);
        newBalance = result.rows[0]?.balance || 0;
      } catch (balanceError) {
        if (balanceError.message.includes('column "balance" does not exist')) {
          console.warn(`⚠️ [REFUND] Balance column missing - will create it. Error: ${balanceError.message}`);
          // Try to add the column
          try {
            await pool.query(`
              ALTER TABLE users 
              ADD COLUMN IF NOT EXISTS balance DECIMAL(10, 2) DEFAULT 0.00
            `);
            // Retry the balance update
            const updateQuery = `
              UPDATE users 
              SET balance = COALESCE(balance, 0) + $1
              WHERE id = $2
              RETURNING balance
            `;
            const result = await pool.query(updateQuery, [amount, userId]);
            newBalance = result.rows[0]?.balance || 0;
            console.log(`✅ [REFUND] Balance column created and updated successfully`);
          } catch (retryError) {
            console.error(`❌ [REFUND] Failed to create/update balance column:`, retryError.message);
            throw balanceError; // Throw original error
          }
        } else {
          throw balanceError; // Re-throw if not a column missing error
        }
      }

      // Record the wallet transaction
      const transactionQuery = `
        INSERT INTO payments (
          user_id, challenge_id, phone_number, amount, 
          transaction_type, status, opponent_id, request_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      await pool.query(transactionQuery, [
        userId,
        challengeId,
        phoneNumber,
        amount,
        "wallet_credit",
        "completed",
        opponentId,
        `WALLET_CREDIT_${Date.now()}_${userId}`, // Generate unique request_id for wallet credits
      ]);

      // Notify user
      if (io) {
        io.to(userId.toString()).emit("refund-to-wallet", {
          amount,
          newBalance,
          message: `Refund of ${amount} KES has been added to your wallet. New balance: ${newBalance} KES`,
        });
      }

      console.log(
        `✅ [REFUND] Added ${amount} KES to wallet for user ${userId}. New balance: ${newBalance} KES`
      );
    } catch (error) {
      console.error(`❌ [REFUND] Failed to add to wallet:`, error);
      throw error;
    }
  }
}

export default new PaymentTimeoutChecker();
