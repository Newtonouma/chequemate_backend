import asyncHandler from "express-async-handler";
import pool from "../config/database.js";

// @desc    Get user wallet balance and transactions
// @route   GET /api/wallet
// @access  Private
export const getWallet = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  try {
    // Get current balance
    const balanceResult = await pool.query(
      "SELECT balance FROM users WHERE id = $1",
      [userId]
    );

    // Get recent transactions (last 20)
    const transactionsResult = await pool.query(
      `
      SELECT id, type, amount, description, reference_id, status, created_at
      FROM transactions 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `,
      [userId]
    );

    const balance = balanceResult.rows[0]?.balance || 0.0;
    const transactions = transactionsResult.rows;

    res.json({
      balance: parseFloat(balance),
      currency: "KES",
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: parseFloat(t.amount),
        description: t.description,
        referenceId: t.reference_id,
        status: t.status,
        date: t.created_at,
      })),
    });
  } catch (error) {
    console.error("Error fetching wallet data:", error);
    res.status(500);
    throw new Error("Failed to fetch wallet data");
  }
});

// @desc    Add funds to wallet
// @route   POST /api/wallet/deposit
// @access  Private
export const depositFunds = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { amount, paymentMethod, referenceId } = req.body;

  if (!amount || amount <= 0) {
    res.status(400);
    throw new Error("Invalid amount");
  }

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Create transaction record
      const transactionResult = await client.query(
        `
        INSERT INTO transactions (user_id, type, amount, description, reference_id, status)
        VALUES ($1, 'credit', $2, $3, $4, 'completed')
        RETURNING id
      `,
        [
          userId,
          amount,
          `Deposit via ${paymentMethod || "M-Pesa"}`,
          referenceId,
        ]
      );

      // Update user balance
      await client.query(
        `
        UPDATE users 
        SET balance = balance + $1
        WHERE id = $2
      `,
        [amount, userId]
      );

      await client.query("COMMIT");

      // Get updated balance
      const balanceResult = await client.query(
        "SELECT balance FROM users WHERE id = $1",
        [userId]
      );

      res.json({
        success: true,
        transactionId: transactionResult.rows[0].id,
        newBalance: parseFloat(balanceResult.rows[0].balance),
        message: "Funds deposited successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error depositing funds:", error);
    res.status(500);
    throw new Error("Failed to deposit funds");
  }
});

// @desc    Withdraw funds from wallet
// @route   POST /api/wallet/withdraw
// @access  Private
export const withdrawFunds = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { amount, withdrawalMethod, accountDetails } = req.body;

  if (!amount || amount <= 0) {
    res.status(400);
    throw new Error("Invalid amount");
  }

  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check current balance
      const balanceResult = await client.query(
        "SELECT balance FROM users WHERE id = $1",
        [userId]
      );

      const currentBalance = parseFloat(balanceResult.rows[0]?.balance || 0);

      if (currentBalance < amount) {
        res.status(400);
        throw new Error("Insufficient balance");
      }

      // Create transaction record
      const transactionResult = await client.query(
        `
        INSERT INTO transactions (user_id, type, amount, description, reference_id, status)
        VALUES ($1, 'debit', $2, $3, $4, 'pending')
        RETURNING id
      `,
        [
          userId,
          amount,
          `Withdrawal to ${withdrawalMethod || "M-Pesa"}`,
          `WD_${Date.now()}`,
        ]
      );

      // Update user balance
      await client.query(
        `
        UPDATE users 
        SET balance = balance - $1
        WHERE id = $2
      `,
        [amount, userId]
      );

      await client.query("COMMIT");

      // Get updated balance
      const updatedBalanceResult = await client.query(
        "SELECT balance FROM users WHERE id = $1",
        [userId]
      );

      res.json({
        success: true,
        transactionId: transactionResult.rows[0].id,
        newBalance: parseFloat(updatedBalanceResult.rows[0].balance),
        message: "Withdrawal request submitted successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    res.status(500);
    throw new Error("Failed to process withdrawal");
  }
});
