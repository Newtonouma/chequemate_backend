import pool from './config/database.js';

console.log('🔍 Checking database state...');

try {
  // Check ongoing matches
  const ongoingResult = await pool.query('SELECT * FROM ongoing_matches ORDER BY created_at DESC LIMIT 3');
  console.log('📊 Ongoing matches:', ongoingResult.rows.length);
  
  if (ongoingResult.rows.length > 0) {
    ongoingResult.rows.forEach((match, i) => {
      console.log(`${i + 1}. Match ID: ${match.id}`);
      console.log(`   Players: ${match.challenger_username} vs ${match.opponent_username}`);
      console.log(`   Platform: ${match.platform}`);
      console.log(`   Challenger Redirected: ${match.challenger_redirected}`);
      console.log(`   Opponent Redirected: ${match.opponent_redirected}`);
      console.log(`   Both Redirected: ${match.both_redirected}`);
      console.log(`   Match Started: ${match.match_started_at}`);
      console.log(`   Result Checked: ${match.result_checked}`);
      console.log();
    });
  }

  // Check challenges
  const challengeResult = await pool.query("SELECT * FROM challenges WHERE status != 'completed' ORDER BY created_at DESC LIMIT 3");
  console.log('📋 Active challenges:', challengeResult.rows.length);
  
  if (challengeResult.rows.length > 0) {
    challengeResult.rows.forEach((challenge, i) => {
      console.log(`${i + 1}. Challenge ID: ${challenge.id}`);
      console.log(`   From: ${challenge.challenger_id} To: ${challenge.opponent_id}`);
      console.log(`   Platform: ${challenge.platform}`);
      console.log(`   Status: ${challenge.status}`);
      console.log();
    });
  }

  // Test the ready matches query directly
  console.log('🎯 Testing ready matches query...');
  const readyQuery = `
    SELECT * FROM ongoing_matches 
    WHERE both_redirected = TRUE 
      AND result_checked = FALSE 
      AND match_started_at <= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
  `;
  
  const readyResult = await pool.query(readyQuery);
  console.log(`Ready matches found: ${readyResult.rows.length}`);

} catch (error) {
  console.error('❌ Database error:', error);
}

process.exit(0);
