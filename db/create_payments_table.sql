-- Create payments table for handling deposits and withdrawals
-- This table tracks all payment transactions in the system

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    challenge_id INTEGER REFERENCES challenges(id) ON DELETE SET NULL,
    phone_number VARCHAR(20) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'refund')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    request_id VARCHAR(255) UNIQUE NOT NULL,
    game_id INTEGER, -- For legacy compatibility
    payout_reason VARCHAR(255), -- For withdrawals
    transaction_reference VARCHAR(255), -- External payment reference
    callback_data JSONB, -- Store full callback payload
    opponent_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_challenge_id ON payments(challenge_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_type ON payments(transaction_type);
CREATE INDEX IF NOT EXISTS idx_payments_request_id ON payments(request_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_opponent_id ON payments(opponent_id);
CREATE INDEX IF NOT EXISTS idx_payments_callback_data ON payments USING GIN (callback_data);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payments_updated_at_trigger
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_payments_updated_at();

COMMENT ON TABLE payments IS 'Tracks all payment transactions (deposits, withdrawals, refunds)';
COMMENT ON COLUMN payments.transaction_type IS 'Type of payment: deposit, withdrawal, or refund';
COMMENT ON COLUMN payments.status IS 'Payment status: pending, completed, failed, or cancelled';
COMMENT ON COLUMN payments.request_id IS 'Unique identifier for the payment request';
COMMENT ON COLUMN payments.callback_data IS 'JSON data from payment provider callbacks';
COMMENT ON COLUMN payments.opponent_id IS 'ID of the opponent in the challenge (for tracking paired deposits)';