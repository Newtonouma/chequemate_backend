-- Migration: Add missing transaction types to payments table constraint
-- This fixes the error: "new row for relation "payments" violates check constraint "payments_transaction_type_check""

-- Drop the existing constraint
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_transaction_type_check;

-- Recreate constraint with all needed transaction types
ALTER TABLE payments ADD CONSTRAINT payments_transaction_type_check 
  CHECK (transaction_type IN (
    'deposit',           -- User deposits money
    'withdrawal',        -- User withdraws to M-Pesa
    'payout',           -- Winnings paid out to M-Pesa
    'refund',           -- Refund credited to balance or M-Pesa
    'balance_credit',   -- Winnings/refunds below 10 KSH credited to balance
    'bet',              -- Money staked on a game
    'stake'             -- Alternative name for bet
  ));

-- Add index on transaction_type for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_transaction_type ON payments(transaction_type);

-- Verify the constraint was applied
SELECT 
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS constraint_definition
FROM pg_constraint
WHERE conname = 'payments_transaction_type_check';
