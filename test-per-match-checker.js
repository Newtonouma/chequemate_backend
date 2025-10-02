import pool from './config/database.js';
import PerMatchResultChecker from './services/PerMatchResultChecker.js';

async function testPerMatchChecker() {
  console.log('🧪 Testing Per-Match Result Checker System');
  
  try {
    // Get a match that should have both_redirected = true
    const matches = await pool.query(`
      SELECT * FROM ongoing_matches 
      WHERE challenger_redirected = true 
      AND opponent_redirected = true 
      AND both_redirected = false
      LIMIT 1
    `);
    
    if (matches.rows.length === 0) {
      console.log('❌ No matches found with redirection mismatch');
      return;
    }
    
    const match = matches.rows[0];
    console.log('🔍 Found match with redirection mismatch:', {
      id: match.id,
      challengeId: match.challenge_id,
      challengerRedirected: match.challenger_redirected,
      opponentRedirected: match.opponent_redirected,
      bothRedirected: match.both_redirected
    });
    
    // Fix the both_redirected field
    await pool.query(`
      UPDATE ongoing_matches 
      SET both_redirected = true, match_started_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `, [match.id]);
    
    console.log('✅ Fixed both_redirected field for match', match.id);
    
    // Get challenge details for this match
    const challengeQuery = await pool.query(`
      SELECT c.*, cu.username as challenger_username, ou.username as opponent_username
      FROM challenges c
      JOIN users cu ON c.challenger = cu.id
      JOIN users ou ON c.opponent = ou.id
      WHERE c.id = $1
    `, [match.challenge_id]);
    
    if (challengeQuery.rows.length === 0) {
      console.log('❌ Challenge not found for match', match.id);
      return;
    }
    
    const challenge = challengeQuery.rows[0];
    console.log('📋 Challenge details:', {
      id: challenge.id,
      betAmount: challenge.bet_amount,
      timeControl: challenge.time_control,
      challenger: challenge.challenger_username,
      opponent: challenge.opponent_username,
      platform: challenge.platform
    });
    
    // Test the per-match checker if it's a bet match
    if (challenge.bet_amount > 0) {
      console.log('💰 This is a bet match, testing per-match checker...');
      
      PerMatchResultChecker.startCheckingMatch({
        matchId: match.id,
        timeControl: challenge.time_control || '10+0',
        startedAt: new Date(),
        challenger: challenge.challenger_username,
        opponent: challenge.opponent_username,
        platform: challenge.platform
      });
      
      console.log('🚀 Per-match checker started for match', match.id);
      
      // Wait a few seconds and check status
      setTimeout(() => {
        const status = PerMatchResultChecker.getStatus();
        console.log('📊 Per-match checker status:', status);
        
        // Stop the checker after test
        setTimeout(() => {
          PerMatchResultChecker.manualStopCheck(match.id);
          console.log('🛑 Test completed, stopped checker for match', match.id);
          process.exit(0);
        }, 5000);
      }, 3000);
      
    } else {
      console.log('ℹ️  Not a bet match, skipping per-match checker test');
      process.exit(0);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

testPerMatchChecker();
