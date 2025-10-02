import pool from './config/database.js';

async function quickCheck() {
  try {
    console.log('🔍 Checking current ongoing matches...');
    
    // Get all ongoing matches
    const matches = await pool.query(`
      SELECT 
        om.*,
        c.bet_amount,
        cu.username as challenger_username,
        ou.username as opponent_username,
        c.platform
      FROM ongoing_matches om
      JOIN challenges c ON om.challenge_id = c.id
      JOIN users cu ON c.challenger = cu.id
      JOIN users ou ON c.opponent = ou.id
      WHERE om.result_checked = false
      ORDER BY om.created_at DESC
    `);
    
    console.log(`\n📊 Found ${matches.rows.length} active matches:`);
    
    if (matches.rows.length === 0) {
      console.log('   No active matches found');
      process.exit(0);
    }
    
    matches.rows.forEach((match, index) => {
      console.log(`\n${index + 1}. Match ID: ${match.id}`);
      console.log(`   Challenge ID: ${match.challenge_id}`);
      console.log(`   Players: ${match.challenger_username} vs ${match.opponent_username}`);
      console.log(`   Platform: ${match.platform}`);
      console.log(`   Bet Amount: $${match.bet_amount || 0}`);
      console.log(`   Both Redirected: ${match.both_redirected}`);
      console.log(`   Match Started At: ${match.match_started_at}`);
      console.log(`   Created At: ${match.created_at}`);
      console.log(`   Result Checked: ${match.result_checked}`);
      console.log(`   Winner ID: ${match.winner_id || 'None'}`);
      console.log(`   Result: ${match.result || 'None'}`);
      
      // Calculate time since match started
      if (match.match_started_at) {
        const timeSince = Date.now() - new Date(match.match_started_at).getTime();
        const minutesSince = Math.floor(timeSince / (1000 * 60));
        console.log(`   Time Since Started: ${minutesSince} minutes ago`);
      }
    });
    
    // Check if there should be active checkers
    console.log('\n🤖 Match checker should be looking for results on these matches...');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  process.exit(0);
}

quickCheck();

quickCheck();
