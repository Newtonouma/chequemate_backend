-- Migration to add rating-related columns to users table
-- This fixes the "current_rating" column does not exist error

-- Add current_rating column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'current_rating') THEN
        ALTER TABLE users ADD COLUMN current_rating INTEGER DEFAULT 1200;
    END IF;
END $$;

-- Add last_rating_update column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'last_rating_update') THEN
        ALTER TABLE users ADD COLUMN last_rating_update TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Update existing users to have default rating if null
UPDATE users SET current_rating = 1200 WHERE current_rating IS NULL;

-- Create index for better performance on rating queries
CREATE INDEX IF NOT EXISTS idx_users_current_rating ON users(current_rating);
CREATE INDEX IF NOT EXISTS idx_users_last_rating_update ON users(last_rating_update);

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('current_rating', 'last_rating_update')
ORDER BY column_name;