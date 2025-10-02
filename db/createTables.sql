-- Create ongoing_matches table
CREATE TABLE IF NOT EXISTS ongoing_matches (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL,
    challenger_id INTEGER NOT NULL,
    opponent_id INTEGER NOT NULL,
    platform VARCHAR(50) NOT NULL,
    challenger_username VARCHAR(255) NOT NULL,
    opponent_username VARCHAR(255) NOT NULL,
    both_redirected BOOLEAN DEFAULT FALSE,
    challenger_redirected BOOLEAN DEFAULT FALSE,
    opponent_redirected BOOLEAN DEFAULT FALSE,
    match_started_at TIMESTAMP WITH TIME ZONE,
    result_checked BOOLEAN DEFAULT FALSE,
    winner_id INTEGER,
    result VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create match_results table
CREATE TABLE IF NOT EXISTS match_results (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL,
    winner_id INTEGER,
    loser_id INTEGER,
    result VARCHAR(20) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    match_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    game_url VARCHAR(500),
    rating_change_winner INTEGER DEFAULT 0,
    rating_change_loser INTEGER DEFAULT 0
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_challenge_id ON ongoing_matches(challenge_id);
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_both_redirected ON ongoing_matches(both_redirected, result_checked);
CREATE INDEX IF NOT EXISTS idx_match_results_challenge_id ON match_results(challenge_id);
CREATE INDEX IF NOT EXISTS idx_match_results_winner_id ON match_results(winner_id);
