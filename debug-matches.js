import pool from './config/database.js';

async function checkMatches() {
  console.log('🔍 Checking current ongoing matches...');
  
  const result = await pool.query('SELECT * FROM ongoing_matches ORDER BY created_at DESC LIMIT 5');
  
  if (result.rows.length === 0) {
    console.log('ℹ️  No ongoing matches found.');
  } else {
    console.log('📋 Current ongoing matches:');
    result.rows.forEach((match, i) => {
      const timeSinceCreated = match.created_at ? Math.floor((Date.now() - new Date(match.created_at).getTime()) / 60000) : 'unknown';
      const timeSinceStarted = match.match_started_at ? Math.floor((Date.now() - new Date(match.match_started_at).getTime()) / 60000) : 'not started';
      console.log(`${i + 1}. ID: ${match.id}, Challenge: ${match.challenge_id}`);
      console.log(`   Players: ${match.challenger_username} vs ${match.opponent_username}`);
      console.log(`   Platform: ${match.platform}`);
      console.log(`   Challenger Redirected: ${match.challenger_redirected}`);
      console.log(`   Opponent Redirected: ${match.opponent_redirected}`);
      console.log(`   Both Redirected: ${match.both_redirected}`);
      console.log(`   Started At: ${match.match_started_at}`);
      console.log(`   Result Checked: ${match.result_checked}`);
      console.log(`   Created: ${timeSinceCreated} minutes ago`);
      console.log(`   Started: ${timeSinceStarted} minutes ago`);
      console.log();
    });
  }
  
  // Also check what the findReadyMatches query would return
  console.log('🎯 Checking what findReadyMatches query returns...');
  const readyQuery = `
    SELECT * FROM ongoing_matches 
    WHERE both_redirected = TRUE 
      AND result_checked = FALSE 
      AND match_started_at <= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
  `;
  
  const readyResult = await pool.query(readyQuery);
  console.log(`Found ${readyResult.rows.length} ready matches:`, readyResult.rows);
  
  process.exit(0);
}

checkMatches().catch(console.error);
