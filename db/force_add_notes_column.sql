-- Force add missing notes column to payments table
-- New migration file to bypass already-applied status

ALTER TABLE payments ADD COLUMN notes TEXT;
CREATE INDEX idx_payments_notes_v2 ON payments(notes);