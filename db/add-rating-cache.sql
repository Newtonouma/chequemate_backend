-- Add rating cache fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS current_rating INTEGER DEFAULT 1200,
ADD COLUMN IF NOT EXISTS chess_ratings JSONB,
ADD COLUMN IF NOT EXISTS last_rating_update TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS slogan VARCHAR(255) DEFAULT 'Ready to play!';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_rating_update ON users(last_rating_update);
