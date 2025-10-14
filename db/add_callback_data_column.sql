-- Add callback_data column to payments table to store full callback payload
ALTER TABLE payments ADD COLUMN IF NOT EXISTS callback_data JSONB;

-- Add index for faster queries on callback data
CREATE INDEX IF NOT EXISTS idx_payments_callback_data ON payments USING GIN (callback_data);

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payments' AND column_name = 'callback_data';
