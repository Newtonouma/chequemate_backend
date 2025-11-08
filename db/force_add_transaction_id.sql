-- Force add missing transaction_id column to payments table  
-- New migration file to bypass already-applied status

ALTER TABLE payments ADD COLUMN transaction_id VARCHAR(255);
CREATE INDEX idx_payments_transaction_id_v2 ON payments(transaction_id);