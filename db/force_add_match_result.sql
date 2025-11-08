-- Force add missing match_result column to ongoing_matches table
-- New migration file to bypass already-applied status

ALTER TABLE ongoing_matches ADD COLUMN match_result VARCHAR(50);
CREATE INDEX idx_ongoing_matches_match_result_v2 ON ongoing_matches(match_result);