-- Migration to add rating-related columns to users table (v2 - simple)
-- This fixes the "current_rating" column does not exist error

-- Add current_rating column
ALTER TABLE users ADD COLUMN current_rating INTEGER DEFAULT 1200;

-- Add last_rating_update column
ALTER TABLE users ADD COLUMN last_rating_update TIMESTAMP WITH TIME ZONE;

-- Update existing users to have default rating if null
UPDATE users SET current_rating = 1200 WHERE current_rating IS NULL;

-- Create index for better performance on rating queries
CREATE INDEX IF NOT EXISTS idx_users_current_rating ON users(current_rating);
CREATE INDEX IF NOT EXISTS idx_users_last_rating_update ON users(last_rating_update);