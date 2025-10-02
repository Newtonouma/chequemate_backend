import pool from './config/database.js';

async function clearMatches() {
  try {
    const result = await pool.query('DELETE FROM ongoing_matches');
    console.log('🧹 Cleared all ongoing matches:', result.rowCount, 'matches deleted');
    
    // Also clear any old match results
    const resultsClear = await pool.query('DELETE FROM match_results');
    console.log('🧹 Cleared all match results:', resultsClear.rowCount, 'results deleted');
    
    process.exit(0);
  } catch (error) {
    console.error('Error clearing matches:', error);
    process.exit(1);
  }
}

clearMatches();
