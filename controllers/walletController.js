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

    // Get recent transactions from payments table (last 20)
    const transactionsResult = await pool.query(
      `
      SELECT id, transaction_type, amount, status, notes, created_at, request_id
      FROM payments 
      WHERE user_id = $1 
      ORDER BY created_at DESC 
      LIMIT 20
    `,
      [userId]
    );

    const balance = balanceResult.rows[0]?.balance || 0.0;
    const transactions = transactionsResult.rows;

    // Helper function to determine if transaction is credit or debit
    const getCreditDebitType = (transactionType, notes) => {
      // SPECIAL CASE: Old transactions that were mis-labeled as "withdrawal" 
      // but were actually balance credits (check notes field)
      if (transactionType.toLowerCase() === 'withdrawal' && notes) {
        if (notes.toLowerCase().includes('credited to user balance') || 
            notes.toLowerCase().includes('credited to balance')) {
          return 'credit'; // These are actually credits (GREEN), not withdrawals
        }
      }

      // Money coming IN (GREEN) - deposits, winnings, refunds, credits
      const creditTypes = [
        'deposit',           // M-PESA deposits
        'refund',            // Auto-refunds from cancelled matches
        'balance_credit',    // Small winnings (<10 KSH) credited to balance
        'win',               // Match winnings
        'payout',            // Payouts (winnings paid out or credited)
        'reward',            // Bonuses/rewards
        'bonus',             // Promotional bonuses
        'cashback',          // Cashback credits
      ];
      
      // Money going OUT (RED) - withdrawals, bets, stakes, fees
      const debitTypes = [
        'withdrawal',        // M-PESA withdrawals from balance
        'bet',               // Stakes/bets placed using wallet balance
        'stake',             // Match entry fees paid from wallet
        'fee',               // Transaction fees
        'charge',            // Service charges
        'deduction',         // Any deductions
        'spend',             // General spending from wallet
      ];
      
      const lowerType = transactionType.toLowerCase();
      
      // Check if it's explicitly a debit (money going out - RED)
      if (debitTypes.some(type => lowerType.includes(type))) {
        return 'debit';
      }
      
      // Check if it's a credit (money coming in - GREEN)
      if (creditTypes.some(type => lowerType.includes(type))) {
        return 'credit';
      }
      
      // Default: treat unknown types as credit (safer to assume money IN)
      console.log(`⚠️ Unknown transaction type "${transactionType}", defaulting to credit`);
      return 'credit';
    };

    res.json({
      balance: parseFloat(balance),
      currency: "KES",
      minimumWithdrawal: 10, // Include minimum withdrawal threshold
      transactions: transactions.map((t) => ({
        id: t.id,
        type: getCreditDebitType(t.transaction_type, t.notes), // Map to 'credit' or 'debit' for UI colors (pass notes for special cases)
        transactionType: t.transaction_type, // Keep original type for reference
        amount: parseFloat(t.amount),
        description: t.notes || `${t.transaction_type} transaction`,
        referenceId: t.request_id,
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
