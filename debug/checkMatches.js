import pool from '../config/database.js';

async function inspectDatabase() {
  console.log('=== Database Inspection Report ===\n');
  
  try {
    // Check if tables exist
    console.log('1. Checking if required tables exist...');
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ongoing_matches', 'match_results', 'challenges', 'users')
    `);
    
    console.log('Existing tables:', tableCheck.rows.map(r => r.table_name));
    
    // Check ongoing_matches structure
    console.log('\n2. Checking ongoing_matches table structure...');
    const ongoingStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'ongoing_matches'
      ORDER BY ordinal_position
    `);
    
    if (ongoingStructure.rows.length > 0) {
      console.log('ongoing_matches columns:');
      ongoingStructure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else {
      console.log('ongoing_matches table does not exist!');
    }
    
    // Check match_results structure
    console.log('\n3. Checking match_results table structure...');
    const resultsStructure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'match_results'
      ORDER BY ordinal_position
    `);
    
    if (resultsStructure.rows.length > 0) {
      console.log('match_results columns:');
      resultsStructure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
      });
    } else {
      console.log('match_results table does not exist!');
    }
    
    // Check recent ongoing matches
    console.log('\n4. Checking recent ongoing matches...');
    try {
      const recentOngoing = await pool.query(`
        SELECT * FROM ongoing_matches 
        WHERE created_at >= NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 10
      `);
      
      console.log(`Found ${recentOngoing.rows.length} recent ongoing matches:`);
      recentOngoing.rows.forEach((match, i) => {
        console.log(`\n  Match ${i + 1}:`);
        console.log(`    ID: ${match.id}`);
        console.log(`    Challenge ID: ${match.challenge_id}`);
        console.log(`    Challenger: ${match.challenger_username} (ID: ${match.challenger_id})`);
        console.log(`    Opponent: ${match.opponent_username} (ID: ${match.opponent_id})`);
        console.log(`    Platform: ${match.platform}`);
        console.log(`    Both Redirected: ${match.both_redirected}`);
        console.log(`    Challenger Redirected: ${match.challenger_redirected}`);
        console.log(`    Opponent Redirected: ${match.opponent_redirected}`);
        console.log(`    Match Started At: ${match.match_started_at}`);
        console.log(`    Result Checked: ${match.result_checked}`);
        console.log(`    Winner ID: ${match.winner_id}`);
        console.log(`    Result: ${match.result}`);
        console.log(`    Created At: ${match.created_at}`);
      });
    } catch (err) {
      console.log('No ongoing_matches table found or error:', err.message);
    }
    
    // Check recent match results
    console.log('\n5. Checking recent match results...');
    try {
      const recentResults = await pool.query(`
        SELECT mr.*, 
               winner.username as winner_username,
               loser.username as loser_username
        FROM match_results mr
        LEFT JOIN users winner ON mr.winner_id = winner.id
        LEFT JOIN users loser ON mr.loser_id = loser.id
        WHERE mr.match_date >= NOW() - INTERVAL '24 hours'
        ORDER BY mr.match_date DESC
        LIMIT 10
      `);
      
      console.log(`Found ${recentResults.rows.length} recent match results:`);
      recentResults.rows.forEach((result, i) => {
        console.log(`\n  Result ${i + 1}:`);
        console.log(`    ID: ${result.id}`);
        console.log(`    Challenge ID: ${result.challenge_id}`);
        console.log(`    Winner: ${result.winner_username} (ID: ${result.winner_id})`);
        console.log(`    Loser: ${result.loser_username} (ID: ${result.loser_id})`);
        console.log(`    Result: ${result.result}`);
        console.log(`    Platform: ${result.platform}`);
        console.log(`    Game URL: ${result.game_url}`);
        console.log(`    Match Date: ${result.match_date}`);
      });
    } catch (err) {
      console.log('No match_results table found or error:', err.message);
    }
    
    // Check recent challenges
    console.log('\n6. Checking recent challenges...');
    const recentChallenges = await pool.query(`
      SELECT c.*, 
             challenger.username as challenger_username,
             opponent.username as opponent_username
      FROM challenges c
      LEFT JOIN users challenger ON c.challenger = challenger.id
      LEFT JOIN users opponent ON c.opponent = opponent.id
      WHERE c.created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY c.created_at DESC
      LIMIT 10
    `);
    
    console.log(`Found ${recentChallenges.rows.length} recent challenges:`);
    recentChallenges.rows.forEach((challenge, i) => {
      console.log(`\n  Challenge ${i + 1}:`);
      console.log(`    ID: ${challenge.id}`);
      console.log(`    Challenger: ${challenge.challenger_username} (ID: ${challenge.challenger})`);
      console.log(`    Opponent: ${challenge.opponent_username} (ID: ${challenge.opponent})`);
      console.log(`    Status: ${challenge.status}`);
      console.log(`    Platform: ${challenge.platform}`);
      console.log(`    Time Control: ${challenge.time_control}`);
      console.log(`    Created At: ${challenge.created_at}`);
    });
    
    console.log(`\n📊 Summary:`);
    console.log(`  - Recent challenges: ${recentChallenges.rows.length} challenges`);
    
  } catch (error) {
    console.error('Error inspecting database:', error);
  }
}

// Run the inspection
inspectDatabase().then(() => {
  console.log('\n=== Inspection Complete ===');
  process.exit(0);
}).catch(error => {
  console.error('Inspection failed:', error);
  process.exit(1);
});
