-- Add missing transaction_id column to payments table
-- This fixes the callback handler error in production

-- Add transaction_id column with proper error handling
BEGIN;

-- Check if column exists before adding it
DO $$
BEGIN
    BEGIN
        ALTER TABLE payments ADD COLUMN transaction_id VARCHAR(255);
        RAISE NOTICE 'Added transaction_id column to payments table';
    EXCEPTION
        WHEN duplicate_column THEN
            RAISE NOTICE 'transaction_id column already exists, skipping';
    END;
END $$;

-- Add index for performance
DO $$
BEGIN
    BEGIN
        CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
        RAISE NOTICE 'Created index on transaction_id column';
    EXCEPTION
        WHEN duplicate_table THEN
            RAISE NOTICE 'Index already exists, skipping';
    END;
END $$;

COMMIT;