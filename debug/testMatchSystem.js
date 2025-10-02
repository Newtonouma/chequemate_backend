import pool from '../config/database.js';
import OngoingMatch from '../models/OngoingMatch.js';

async function testMatchTracking() {
  try {
    console.log('🧪 Testing Match Tracking System\n');

    // 1. Check current database state
    console.log('1. Current Database State:');
    const allMatches = await pool.query('SELECT * FROM ongoing_matches ORDER BY created_at DESC LIMIT 5');
    console.log('Recent ongoing matches:', allMatches.rows.length);
    
    if (allMatches.rows.length > 0) {
      console.log('Latest match:', allMatches.rows[0]);
    }

    // 2. Check challenges
    const challenges = await pool.query(`
      SELECT c.*, 
             challenger.username as challenger_username, 
             opponent.username as opponent_username
      FROM challenges c
      JOIN users challenger ON c.challenger_id = challenger.id
      JOIN users opponent ON c.opponent_id = opponent.id
      WHERE c.status = 'accepted'
      ORDER BY c.created_at DESC 
      LIMIT 3
    `);
    
    console.log('\n2. Recent Accepted Challenges:');
    console.log(`Found ${challenges.rows.length} accepted challenges`);
    
    for (const challenge of challenges.rows) {
      console.log(`Challenge ${challenge.id}: ${challenge.challenger_username} vs ${challenge.opponent_username} on ${challenge.platform}`);
    }

    // 3. Test match creation with first challenge
    if (challenges.rows.length > 0) {
      const testChallenge = challenges.rows[0];
      console.log(`\n3. Testing with Challenge ${testChallenge.id}:`);
      
      // Check if ongoing match already exists
      let existingMatch = await OngoingMatch.findByChallenge(testChallenge.id);
      
      if (!existingMatch) {
        console.log('Creating new ongoing match...');
        const matchData = {
          challengeId: testChallenge.id,
          challengerId: testChallenge.challenger_id,
          opponentId: testChallenge.opponent_id,
          platform: testChallenge.platform,
          challengerUsername: testChallenge.challenger_username,
          opponentUsername: testChallenge.opponent_username
        };
        
        existingMatch = await OngoingMatch.create(matchData);
        console.log('✅ Created ongoing match:', existingMatch.id);
      } else {
        console.log('🔄 Found existing ongoing match:', existingMatch.id);
      }

      // Simulate both users redirecting
      console.log('\n4. Simulating User Redirections:');
      
      // Challenger redirects
      await OngoingMatch.updateRedirection(testChallenge.id, testChallenge.challenger_id, true);
      console.log(`✅ Challenger ${testChallenge.challenger_username} redirected`);
      
      // Opponent redirects
      await OngoingMatch.updateRedirection(testChallenge.id, testChallenge.opponent_id, false);
      console.log(`✅ Opponent ${testChallenge.opponent_username} redirected`);
      
      // Check if both are redirected
      const updatedMatch = await OngoingMatch.findByChallenge(testChallenge.id);
      console.log('\n5. Match Status After Redirections:');
      console.log('Both redirected:', updatedMatch.both_redirected);
      console.log('Match started at:', updatedMatch.match_started_at);
      console.log('Challenger redirected:', updatedMatch.challenger_redirected);
      console.log('Opponent redirected:', updatedMatch.opponent_redirected);

      // Check ready matches
      console.log('\n6. Checking Ready Matches:');
      const readyMatches = await OngoingMatch.findReadyMatches();
      console.log(`Found ${readyMatches.length} matches ready for result checking`);
      
      if (readyMatches.length > 0) {
        console.log('Ready match details:', readyMatches[0]);
        console.log('⏰ Match started:', new Date(readyMatches[0].match_started_at));
        console.log('⏰ Current time:', new Date());
        console.log('⏰ Time difference (minutes):', (Date.now() - new Date(readyMatches[0].match_started_at)) / 60000);
      }
    }

    console.log('\n🎯 Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    process.exit(0);
  }
}

testMatchTracking();
