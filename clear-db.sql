-- Clear all ongoing matches and match results for fresh testing
DELETE FROM ongoing_matches;
DELETE FROM match_results;

-- Show count after deletion
SELECT COUNT(*) as ongoing_matches_count FROM ongoing_matches;
SELECT COUNT(*) as match_results_count FROM match_results;
