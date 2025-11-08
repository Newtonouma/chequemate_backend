-- Migration to add rating-related columns to users table (v3 - ultra simple)
-- This fixes the "current_rating" column does not exist error

-- Add current_rating column (will fail if exists, but that's handled by fallback)
ALTER TABLE users ADD COLUMN current_rating INTEGER DEFAULT 1200;

-- Add last_rating_update column
ALTER TABLE users ADD COLUMN last_rating_update TIMESTAMP WITH TIME ZONE;