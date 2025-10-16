import paymentService from "../services/paymentService.js";
import pool from "../config/database.js";

// Note: io will be set by setSocketIO() method before server starts
let io = null;

class PaymentController {
  // Set the Socket.IO instance (called from app.js after io is initialized)
  static setSocketIO(socketIO) {
    io = socketIO;
    console.log("✅ [PAYMENT_CONTROLLER] Socket.IO instance set");
  }

  // Initiate deposit for a player
  async initiateDeposit(req, res) {
    try {
      const { phoneNumber, amount, challengeId, userId } = req.body;

      console.log(`🏦 [DEPOSIT] Starting deposit initiation:`, {
        phoneNumber,
        amount,
        challengeId,
        userId,
        timestamp: new Date().toISOString(),
      });

      if (!phoneNumber || !amount || !challengeId || !userId) {
        console.error(`❌ [DEPOSIT] Missing required fields:`, {
          phoneNumber: !!phoneNumber,
          amount: !!amount,
          challengeId: !!challengeId,
          userId: !!userId,
        });
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: phoneNumber, amount, challengeId, userId",
        });
      }

      // Generate unique request ID
      const requestId = `DEP_${challengeId}_${userId}_${Date.now()}`;
      console.log(`🆔 [DEPOSIT] Generated request ID: ${requestId}`);

      // Initiate deposit with payment service
      console.log(`📞 [DEPOSIT] Calling payment service with:`, {
        phoneNumber: phoneNumber,
        amount: amount,
        userId: userId,
        challengeId: challengeId,
      });

      const depositResult = await paymentService.initiateDeposit(
        phoneNumber,
        amount,
        userId,
        challengeId
      );

      console.log(`📋 [DEPOSIT] Payment service response:`, {
        success: depositResult.success,
        data: depositResult.data,
        apiResponse: depositResult.apiResponse,
      });

      // Check if deposit was successful
      if (!depositResult.success) {
        console.error(`❌ [DEPOSIT] Payment service error:`, depositResult.error);
        return res.status(500).json({
          success: false,
          message: "Failed to initiate deposit",
          error: depositResult.error,
        });
      }

      console.log(`✅ [DEPOSIT] Deposit initiated successfully`);

      const responseData = {
        success: true,
        message: "Deposit initiated successfully",
        data: {
          paymentId: depositResult.data.id,
          requestId: depositResult.data.request_id,
          amount: amount,
          phoneNumber: phoneNumber,
          apiResponse: depositResult.apiResponse,
        },
      };

      console.log(`📤 [DEPOSIT] Sending response:`, responseData);
      res.json(responseData);
    } catch (error) {
      console.error("Error initiating deposit:", error);
      res.status(500).json({
        success: false,
        message: "Failed to initiate deposit",
        error: error.message,
      });
    }
  }

  // Initiate withdrawal (payout) for a player
  async initiateWithdrawal(req, res) {
    try {
      const { phoneNumber, amount, gameId, userId, reason } = req.body;

      if (!phoneNumber || !amount || !gameId || !userId) {
        return res.status(400).json({
          success: false,
          message:
            "Missing required fields: phoneNumber, amount, gameId, userId",
        });
      }

      // Generate unique request ID
      const requestId = `WTH_${gameId}_${userId}_${Date.now()}`;

      // Initiate withdrawal with payment service
      const withdrawalResult = await paymentService.initiateWithdrawal(
        phoneNumber,
        amount,
        requestId
      );

      // Store payment record in database
      const insertQuery = `
        INSERT INTO payments (
          game_id, 
          user_id, 
          phone_number, 
          amount, 
          transaction_type, 
          request_id, 
          status, 
          payout_reason,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING *;
      `;

      const paymentRecord = await pool.query(insertQuery, [
        gameId,
        userId,
        phoneNumber,
        amount,
        "withdrawal",
        requestId,
        "pending",
        reason || "game_payout",
      ]);

      res.json({
        success: true,
        message: "Withdrawal initiated successfully",
        data: {
          paymentId: paymentRecord.rows[0].id,
          requestId: requestId,
          amount: amount,
          phoneNumber: phoneNumber,
          withdrawalResponse: withdrawalResult,
        },
      });
    } catch (error) {
      console.error("Error initiating withdrawal:", error);
      res.status(500).json({
        success: false,
        message: "Failed to initiate withdrawal",
        error: error.message,
      });
    }
  }

  /**
   * Extract request ID from ONIT callback payload
   * Handles cases where originatorRequestId is missing but embedded in error messages
   * Example: "1003|DEP_69_8_1760555690220 : Error..." → "DEP_69_8_1760555690220"
   */
  extractRequestId(payload) {
    // First try standard fields
    let requestId = payload.originatorRequestId || payload.requestId;

    if (requestId) {
      // Strip ONIT prefix if present (e.g., "1003|DEP_72_2_1760573288599" → "DEP_72_2_1760573288599")
      const prefixMatch = requestId.match(/^\d+\|(.+)$/);
      if (prefixMatch && prefixMatch[1]) {
        console.log(`🔍 [CALLBACK] Stripped prefix from request ID: "${requestId}" → "${prefixMatch[1]}"`);
        return prefixMatch[1];
      }
      return requestId;
    }

    // Try to extract from message/description text using regex
    const text =
      payload.message || payload.description || payload.responseMessage || "";

    // Pattern matches: "1003|DEP_69_8_1760555690220 :" or "WTH_123_456_789 :"
    const patterns = [
      /\|([A-Z]+_\d+_\d+_\d+)\s*[:]/i, // After pipe symbol
      /([A-Z]+_\d+_\d+_\d+)/i, // Anywhere in text
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        console.log(
          `🔍 [CALLBACK] Extracted request ID from message: "${match[1]}"`
        );
        return match[1];
      }
    }

    return null;
  }

  // Handle webhook callbacks from payment provider
  async handleCallback(req, res) {
    try {
      console.log("💳 [CALLBACK] Payment callback received:", req.body);

      // Extract request ID using helper function
      const originatorRequestId = this.extractRequestId(req.body);
      const onitStatus = req.body.status;
      const transactionReference = req.body.transactionReference;
      const transactionId = req.body.transactionId;
      const timestamp = req.body.timestamp;

      if (!originatorRequestId) {
        console.error(
          "❌ [CALLBACK] Missing originatorRequestId/requestId in callback"
        );
        // Return 200 OK to prevent ONIT from retrying forever (idempotent)
        return res.status(200).json({
          success: false,
          message: "Missing originatorRequestId in callback",
        });
      }

      // Map ONIT status to our internal status
      // If transactionReference exists, assume success (ONIT doesn't always send status field)
      let mappedStatus = "pending";
      
      if (transactionReference) {
        // If ONIT provides a transaction reference, payment is successful
        mappedStatus = "completed";
        console.log(`✅ [CALLBACK] Transaction reference found: ${transactionReference} → marking as completed`);
      } else if (onitStatus) {
        // Fallback to status field if present
        const statusLower = onitStatus.toLowerCase();
        if (statusLower.includes("success") || statusLower.includes("complete")) {
          mappedStatus = "completed";
        } else if (
          statusLower.includes("fail") ||
          statusLower.includes("error")
        ) {
          mappedStatus = "failed";
        } else if (
          statusLower.includes("pend") ||
          statusLower.includes("processing")
        ) {
          mappedStatus = "processing";
        }
      }

      console.log(
        `📊 [CALLBACK] Status mapping: "${onitStatus || 'undefined'}" → "${mappedStatus}" (txRef: ${transactionReference || 'none'})`
      );

      // Update payment status in database
      const updateQuery = `
        UPDATE payments 
        SET 
          status = $1,
          transaction_id = $2,
          callback_data = $3,
          updated_at = NOW()
        WHERE request_id = $4
        RETURNING *;
      `;

      const result = await pool.query(updateQuery, [
        mappedStatus,
        transactionReference || transactionId, // Use transactionReference if available
        JSON.stringify(req.body),
        originatorRequestId,
      ]);

      if (result.rows.length === 0) {
        console.warn(
          `⚠️ [CALLBACK] Payment record not found for requestId: ${originatorRequestId}`
        );
        // Return 200 OK (idempotent) - prevents ONIT from retrying forever
        return res.status(200).json({
          success: true,
          message:
            "Callback received but transaction not found (likely already processed)",
        });
      }

      const payment = result.rows[0];
      console.log(
        `✅ [CALLBACK] Updated payment ${payment.id}: ${payment.transaction_type} → ${mappedStatus}`
      );

      // If this is a deposit callback and failed, notify the user
      if (
        payment.transaction_type === "deposit" &&
        mappedStatus === "failed" &&
        payment.user_id
      ) {
        console.log(
          `💔 [CALLBACK] Emitting paymentFailed to user ${payment.user_id}`
        );
        if (this.io) {
          this.io.to(payment.user_id.toString()).emit("paymentFailed", {
            userId: payment.user_id,
            challengeId: payment.challenge_id,
            amount: payment.amount,
            message:
              req.body.message ||
              req.body.description ||
              "Payment failed. Please try again.",
            timestamp: new Date().toISOString(),
          });
        }
      }

      // If this is a deposit callback and completed, check if both players have deposited
      if (
        payment.transaction_type === "deposit" &&
        mappedStatus === "completed" &&
        payment.challenge_id
      ) {
        // Check if both deposits are complete (inline to avoid 'this' binding issues)
        try {
          const depositQuery = `
            SELECT COUNT(*) as deposit_count
            FROM payments 
            WHERE challenge_id = $1 
            AND transaction_type = 'deposit' 
            AND status = 'completed';
          `;

          const depositResult = await pool.query(depositQuery, [
            payment.challenge_id,
          ]);
          const depositCount = parseInt(depositResult.rows[0].deposit_count);

          if (depositCount >= 2) {
            // Both players have deposited, update challenge status
            const updateChallengeQuery = `
              UPDATE challenges 
              SET status = 'deposits_complete'
              WHERE id = $1;
            `;

            await pool.query(updateChallengeQuery, [payment.challenge_id]);
            console.log(
              `✅ Both deposits complete for challenge ${payment.challenge_id}`
            );
          }
        } catch (depositError) {
          console.error("⚠️ Error checking deposits:", depositError);
          // Don't fail the callback response for this
        }
      }

      // Always return 200 OK for idempotency
      res.status(200).json({
        success: true,
        message: "Callback processed successfully",
      });
    } catch (error) {
      console.error("❌ [CALLBACK] Error processing payment callback:", error);
      // Return 500 to let ONIT retry (if they support retries)
      res.status(500).json({
        success: false,
        message: "Failed to process callback",
        error: error.message,
      });
    }
  }

  // Check if both players have deposited for a challenge
  async checkBothDepositsComplete(challengeId) {
    try {
      const query = `
        SELECT COUNT(*) as deposit_count
        FROM payments 
        WHERE challenge_id = $1 
        AND transaction_type = 'deposit' 
        AND status = 'completed';
      `;

      const result = await pool.query(query, [challengeId]);
      const depositCount = parseInt(result.rows[0].deposit_count);

      if (depositCount >= 2) {
        // Both players have deposited, update challenge status
        const updateChallengeQuery = `
          UPDATE challenges 
          SET status = 'deposits_complete'
          WHERE id = $1;
        `;

        await pool.query(updateChallengeQuery, [challengeId]);

        console.log(`✅ Both deposits complete for challenge ${challengeId}`);

        // Emit socket event to both players to start the game
        if (io) {
          // Get challenge details to notify both players
          const challengeQuery = `
            SELECT id, challenger, opponent, challenger_username, opponent_username, platform
            FROM challenges 
            WHERE id = $1;
          `;
          const challengeResult = await pool.query(challengeQuery, [
            challengeId,
          ]);

          if (challengeResult.rows.length > 0) {
            const challenge = challengeResult.rows[0];

            const notificationData = {
              challengeId: challenge.id,
              platform: challenge.platform,
              message: "Both players have deposited! Ready to start match.",
              timestamp: new Date().toISOString(),
            };

            // Emit to both challenger and opponent
            io.to(challenge.challenger.toString()).emit(
              "depositsComplete",
              notificationData
            );
            io.to(challenge.opponent.toString()).emit(
              "depositsComplete",
              notificationData
            );

            console.log(
              `📡 [SOCKET] Emitted depositsComplete to both players for challenge ${challengeId}`
            );
          }
        } else {
          console.warn(
            "⚠️ [SOCKET] Socket.IO not available, cannot emit depositsComplete event"
          );
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error("Error checking deposits:", error);
      return false;
    }
  }

  // Get payment status for a challenge or game
  async getPaymentStatus(req, res) {
    try {
      const { challengeId, gameId } = req.query;

      if (!challengeId && !gameId) {
        return res.status(400).json({
          success: false,
          message: "Either challengeId or gameId is required",
        });
      }

      let query = `
        SELECT * FROM payments 
        WHERE ${challengeId ? "challenge_id = $1" : "game_id = $1"}
        ORDER BY created_at DESC;
      `;

      const result = await pool.query(query, [challengeId || gameId]);

      res.json({
        success: true,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error getting payment status:", error);
      res.status(500).json({
        success: false,
        message: "Failed to get payment status",
        error: error.message,
      });
    }
  }

  // Process game payout based on outcome
  async processGamePayout(gameId, result, challengerData, opponentData) {
    try {
      console.log(
        `Processing payout for game ${gameId} with result: ${result}`
      );

      // Get payment details for this game's challenge
      const challengeQuery = `
        SELECT c.*, p.amount, p.phone_number as challenger_phone, p2.phone_number as opponent_phone
        FROM challenges c
        LEFT JOIN payments p ON c.id = p.challenge_id AND p.user_id = c.challenger
        LEFT JOIN payments p2 ON c.id = p2.challenge_id AND p2.user_id = c.opponent
        WHERE c.id = $1;
      `;

      const challengeResult = await pool.query(challengeQuery, [gameId]);

      if (challengeResult.rows.length === 0) {
        console.log("No payment challenge found for challenge:", gameId);
        return;
      }

      const challenge = challengeResult.rows[0];
      const betAmount = challenge.amount;

      if (!betAmount || betAmount <= 0) {
        console.log("No bet amount for challenge:", gameId);
        return;
      }

      // Determine payout logic based on result
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

      const winResults = ["win"];
      const opponentWinResults = [
        "resigned",
        "timeout",
        "checkmated",
        "abandoned",
        "adjudication",
        "rule_violation",
      ];

      if (drawResults.includes(result)) {
        // Refund both players
        await this.refundPlayer(
          challengerData.id,
          challenge.challenger_phone,
          betAmount,
          gameId,
          "draw_refund"
        );
        await this.refundPlayer(
          opponentData.id,
          challenge.opponent_phone,
          betAmount,
          gameId,
          "draw_refund"
        );
      } else if (winResults.includes(result)) {
        // Challenger wins - pay out double amount
        await this.payoutWinner(
          challengerData.id,
          challenge.challenger_phone,
          betAmount * 2,
          gameId,
          "game_win"
        );
      } else if (opponentWinResults.includes(result)) {
        // Opponent wins - pay out double amount
        await this.payoutWinner(
          opponentData.id,
          challenge.opponent_phone,
          betAmount * 2,
          gameId,
          "game_win"
        );
      } else {
        // Unknown result - treat as draw and refund both
        console.log(`Unknown result ${result}, treating as draw`);
        await this.refundPlayer(
          challengerData.id,
          challenge.challenger_phone,
          betAmount,
          gameId,
          "unknown_result_refund"
        );
        await this.refundPlayer(
          opponentData.id,
          challenge.opponent_phone,
          betAmount,
          gameId,
          "unknown_result_refund"
        );
      }
    } catch (error) {
      console.error("Error processing game payout:", error);
    }
  }

  async refundPlayer(userId, phoneNumber, amount, gameId, reason) {
    try {
      await paymentService.initiateWithdrawal(
        phoneNumber,
        amount,
        `REFUND_${gameId}_${userId}_${Date.now()}`
      );
      console.log(`Refunded ${amount} to ${phoneNumber} for reason: ${reason}`);
    } catch (error) {
      console.error(`Failed to refund ${amount} to ${phoneNumber}:`, error);
    }
  }

  async payoutWinner(userId, phoneNumber, amount, gameId, reason) {
    try {
      await paymentService.initiateWithdrawal(
        phoneNumber,
        amount,
        `PAYOUT_${gameId}_${userId}_${Date.now()}`
      );
      console.log(`Paid out ${amount} to ${phoneNumber} for reason: ${reason}`);
    } catch (error) {
      console.error(`Failed to payout ${amount} to ${phoneNumber}:`, error);
    }
  }
}

export default new PaymentController();
