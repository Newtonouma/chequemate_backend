-- Migration: Add opponent_id to payments table for better transaction tracking
-- This allows each payment record to reference the opponent in a challenge

-- Add opponent_id column (nullable since not all transactions have opponents)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS opponent_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_opponent_id ON payments(opponent_id);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'payments' AND column_name = 'opponent_id';
