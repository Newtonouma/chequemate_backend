-- Add missing transaction_id column to payments table
-- This fixes the callback handler error in production

-- Add transaction_id column if it doesn't exist
ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(255);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

-- Comment for clarity
COMMENT ON COLUMN payments.transaction_id IS 'External transaction ID from payment provider (ONIT/M-Pesa)';