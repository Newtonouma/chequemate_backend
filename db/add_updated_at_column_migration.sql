-- Add updated_at column to users table for wallet operations
-- This column is used to track when user records (including wallet balances) are updated

-- Add the column if it doesn't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows with current timestamp (or created_at if available)
UPDATE users 
SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP) 
WHERE updated_at IS NULL;
