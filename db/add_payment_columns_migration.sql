-- Migration to add missing columns to payments table
-- This fixes missing columns: notes, opponent_id, etc.

-- Add notes column for transaction descriptions
ALTER TABLE payments ADD COLUMN notes TEXT;

-- Add opponent_id column for tracking match participants
ALTER TABLE payments ADD COLUMN opponent_id INTEGER REFERENCES users(id);

-- Create indexes for performance
CREATE INDEX idx_payments_notes ON payments(notes);
CREATE INDEX idx_payments_opponent_id ON payments(opponent_id);