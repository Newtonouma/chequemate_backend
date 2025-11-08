-- Add missing transaction_id column to payments table
-- This fixes the callback handler error in production

-- First check if column exists to avoid duplicate column errors
DO $$
BEGIN
    -- Add transaction_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'payments' 
        AND column_name = 'transaction_id'
    ) THEN
        ALTER TABLE payments ADD COLUMN transaction_id VARCHAR(255);
        RAISE NOTICE 'Added transaction_id column to payments table';
    ELSE
        RAISE NOTICE 'transaction_id column already exists in payments table';
    END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id);

-- Comment for clarity
COMMENT ON COLUMN payments.transaction_id IS 'External transaction ID from payment provider (ONIT/M-Pesa)';

-- Show the result
SELECT 'transaction_id column migration completed' as status;