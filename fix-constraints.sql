-- Fix payments table constraint to allow payout and refund
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_transaction_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_transaction_type_check 
    CHECK (transaction_type IN ('deposit', 'withdrawal', 'payout', 'refund'));

-- Add match_result column to ongoing_matches if it doesn't exist
ALTER TABLE ongoing_matches ADD COLUMN IF NOT EXISTS match_result JSONB;
ALTER TABLE ongoing_matches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;

-- Show updated constraints
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'payments' 
    AND tc.constraint_type = 'CHECK';