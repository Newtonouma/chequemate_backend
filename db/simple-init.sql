-- Simple database initialization script without foreign key constraints
-- This avoids constraint issues during initial setup

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(255),
    name VARCHAR(255),
    chess_com_username VARCHAR(255),
    lichess_username VARCHAR(255),
    preferred_platform VARCHAR(255),
    slogan VARCHAR(500) DEFAULT 'Ready to Play!',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create challenges table (no foreign keys for simplicity)
CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    challenger INTEGER NOT NULL,
    opponent INTEGER NOT NULL,
    platform VARCHAR(255) NOT NULL,
    time_control VARCHAR(255) DEFAULT '10+0',
    rules VARCHAR(255) DEFAULT 'chess',
    status VARCHAR(255) DEFAULT 'pending',
    bet_amount DECIMAL(10,2) DEFAULT 0,
    payment_status VARCHAR(50) DEFAULT 'none',
    challenger_phone VARCHAR(20),
    opponent_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create games table (no foreign keys for simplicity)
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL,
    result VARCHAR(10) CHECK (result IN ('1-0', '0-1', '½-½')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create postponed_challenges table (no foreign keys for simplicity)
CREATE TABLE IF NOT EXISTS postponed_challenges (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL,
    postponed_by INTEGER NOT NULL,
    postponed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create ongoing_matches table (CRITICAL for match tracking)
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

-- Create match_results table (CRITICAL for result tracking)
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

-- Create payment_deposits table (for payment tracking)
CREATE TABLE IF NOT EXISTS payment_deposits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'pending',
    external_transaction_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create payment_payouts table (for payout tracking)
CREATE TABLE IF NOT EXISTS payment_payouts (
    id SERIAL PRIMARY KEY,
    winner_id INTEGER NOT NULL,
    challenge_id INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    payout_status VARCHAR(50) DEFAULT 'pending',
    external_transaction_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add basic indexes for performance
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_challenge_id ON ongoing_matches(challenge_id);
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_both_redirected ON ongoing_matches(both_redirected, result_checked);
CREATE INDEX IF NOT EXISTS idx_match_results_challenge_id ON match_results(challenge_id);
CREATE INDEX IF NOT EXISTS idx_match_results_winner_id ON match_results(winner_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges(opponent);