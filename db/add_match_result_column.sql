-- Migration to add match_result column to ongoing_matches table
-- This fixes missing column: match_result

-- Add match_result column to track match outcomes
ALTER TABLE ongoing_matches ADD COLUMN match_result VARCHAR(50);

-- Create index for performance
CREATE INDEX idx_ongoing_matches_match_result ON ongoing_matches(match_result);