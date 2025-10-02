-- Migration to add slogan column to users table
-- Run this if the slogan column doesn't exist in your database

DO $$ 
BEGIN
    -- Check if slogan column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'slogan'
    ) THEN
        ALTER TABLE users ADD COLUMN slogan VARCHAR(500) DEFAULT 'Ready to Play!';
    END IF;
END $$;
