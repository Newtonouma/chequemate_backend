-- Migration: Add performance indexes for high-traffic queries
-- Date: 2025-10-16
-- Description: Adds indexes to improve query performance at scale

-- Payments table indexes
-- Index for finding payments by challenge (used in deposit completion checks)
CREATE INDEX IF NOT EXISTS idx_payments_challenge_id ON payments(challenge_id);

-- Index for filtering by payment status (used in monitoring and status checks)
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Composite index for user-specific payment queries with status filter
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);

-- Index for finding payments by transaction type (deposit vs withdrawal analytics)
CREATE INDEX IF NOT EXISTS idx_payments_transaction_type ON payments(transaction_type);

-- Index for time-based queries (recent payments, payment history)
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Ongoing matches table indexes
-- Index for finding match by challenge (used when match is started)
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_challenge_id ON ongoing_matches(challenge_id);

-- Index for finding unchecked matches (used by PerMatchResultChecker)
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_result_checked ON ongoing_matches(result_checked) 
WHERE result_checked = FALSE;

-- Index for finding active matches by platform (Chess.com vs Lichess)
CREATE INDEX IF NOT EXISTS idx_ongoing_matches_platform ON ongoing_matches(platform);

-- Challenges table indexes
-- Index for finding user's challenges (challenger or opponent)
CREATE INDEX IF NOT EXISTS idx_challenges_challenger ON challenges(challenger);
CREATE INDEX IF NOT EXISTS idx_challenges_opponent ON challenges(opponent);

-- Index for filtering by challenge status (pending, accepted, deposits_complete, etc.)
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);

-- Index for time-based queries (recent challenges)
CREATE INDEX IF NOT EXISTS idx_challenges_created_at ON challenges(created_at DESC);

-- Users table indexes (in addition to balance index from previous migration)
-- Index for username lookups (login, profile views)
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Index for phone number lookups (payment processing)
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Index for Chess.com username lookups (player validation)
CREATE INDEX IF NOT EXISTS idx_users_chess_com_username ON users(chess_com_username);

-- Add statistics collection for query planner optimization
ANALYZE payments;
ANALYZE ongoing_matches;
ANALYZE challenges;
ANALYZE users;

-- Verify indexes were created
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- Show table sizes and index sizes for monitoring
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
