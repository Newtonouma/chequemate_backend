-- Migration: Add balance column to users table for wallet functionality
-- Date: 2025-06-01
-- Description: Adds a balance column with decimal precision for handling wallet amounts

-- Add balance column with default value 0.00
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS balance DECIMAL(10,2) DEFAULT 0.00;

-- Add check constraint to ensure balance is never negative
ALTER TABLE users 
ADD CONSTRAINT positive_balance CHECK (balance >= 0);

-- Create index on balance for faster queries (especially for wallet operations)
CREATE INDEX IF NOT EXISTS idx_users_balance ON users(balance);

-- Update existing users to have 0.00 balance (safe default)
UPDATE users 
SET balance = 0.00 
WHERE balance IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN users.balance IS 'User wallet balance in KSH. Used for small refunds (<=10 KSH) and future wallet features.';

-- Verify the migration
SELECT 
  column_name, 
  data_type, 
  column_default, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'balance';
