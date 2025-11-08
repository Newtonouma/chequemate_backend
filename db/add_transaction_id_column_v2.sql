-- Add missing transaction_id column to payments table (v2 - hotfix)
-- This fixes the callback handler error in production

-- Simple ALTER TABLE statement that should work
ALTER TABLE payments ADD COLUMN transaction_id VARCHAR(255);

-- Add index for performance  
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);