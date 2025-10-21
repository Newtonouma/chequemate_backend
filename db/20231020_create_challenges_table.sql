-- Create challenges table
CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    challenger INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opponent INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    time_control VARCHAR(20) DEFAULT '5+0',
    rules VARCHAR(50) DEFAULT 'chess',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'postponed', 'completed')),
    amount DECIMAL(10,2) DEFAULT 0.00,
    payment_status VARCHAR(20) DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'completed', 'failed')),
    challenger_paid BOOLEAN DEFAULT FALSE,
    opponent_paid BOOLEAN DEFAULT FALSE,
    challenger_phone VARCHAR(20),
    opponent_phone VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges(opponent);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_payment_status ON challenges(payment_status);