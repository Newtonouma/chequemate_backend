import pool from '../config/database.js';

class OngoingMatch {
  static async create(matchData) {
    const {
      challengeId,
      challengerId,
      opponentId,
      platform,
      challengerUsername,
      opponentUsername
    } = matchData;

    const query = `
      INSERT INTO ongoing_matches (
        challenge_id, challenger_id, opponent_id, platform,
        challenger_username, opponent_username
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      challengeId, challengerId, opponentId, platform,
      challengerUsername, opponentUsername
    ]);

    return result.rows[0];
  }

  static async updateRedirection(challengeId, userId, isChallenger) {
    const redirectField = isChallenger ? 'challenger_redirected' : 'opponent_redirected';
    
    // First, get the current state
    const currentQuery = `SELECT challenger_redirected, opponent_redirected FROM ongoing_matches WHERE challenge_id = $1`;
    const currentResult = await pool.query(currentQuery, [challengeId]);
    const current = currentResult.rows[0];
    
    // Determine what the new state will be
    const newChallengerRedirected = isChallenger ? true : current.challenger_redirected;
    const newOpponentRedirected = !isChallenger ? true : current.opponent_redirected;
    const willBothBeRedirected = newChallengerRedirected && newOpponentRedirected;
    
    console.log(`🔄 [${new Date().toISOString()}] Updating redirection for challenge ${challengeId}:`, {
      userId,
      isChallenger,
      currentChallengerRedirected: current.challenger_redirected,
      currentOpponentRedirected: current.opponent_redirected,
      newChallengerRedirected,
      newOpponentRedirected,
      willBothBeRedirected
    });
    
    const query = `
      UPDATE ongoing_matches 
      SET ${redirectField} = TRUE,
          both_redirected = $2,
          match_started_at = CASE 
            WHEN $2 = TRUE 
            THEN CURRENT_TIMESTAMP 
            ELSE match_started_at 
          END
      WHERE challenge_id = $1
      RETURNING *
    `;

    const result = await pool.query(query, [challengeId, willBothBeRedirected]);
    return result.rows[0];
  }

  static async findReadyMatches() {
    // First, let's see all ongoing matches
    const allMatchesQuery = `SELECT * FROM ongoing_matches WHERE result_checked = FALSE`;
    const allMatches = await pool.query(allMatchesQuery);
    
    console.log(`📊 [${new Date().toISOString()}] All ongoing matches (${allMatches.rows.length}):`, 
      allMatches.rows.map(m => ({
        id: m.id,
        challengeId: m.challenge_id,
        challenger: m.challenger_username,
        opponent: m.opponent_username,
        platform: m.platform,
        challengerRedirected: m.challenger_redirected,
        opponentRedirected: m.opponent_redirected,
        bothRedirected: m.both_redirected,
        startedAt: m.match_started_at,
        resultChecked: m.result_checked,
        minutesSinceStart: m.match_started_at ? Math.floor((Date.now() - new Date(m.match_started_at).getTime()) / 60000) : null
      }))
    );
    
    const query = `
      SELECT * FROM ongoing_matches 
      WHERE both_redirected = TRUE 
        AND result_checked = FALSE 
        AND match_started_at <= CURRENT_TIMESTAMP - INTERVAL '30 seconds'
    `;

    const result = await pool.query(query);
    
    // Add some debugging info
    if (result.rows.length > 0) {
      console.log(`🎯 [${new Date().toISOString()}] Ready matches found (${result.rows.length}):`, 
        result.rows.map(m => ({
          id: m.id,
          challenger: m.challenger_username,
          opponent: m.opponent_username,
          platform: m.platform,
          startedAt: m.match_started_at,
          bothRedirected: m.both_redirected,
          resultChecked: m.result_checked
        }))
      );
    }
    
    return result.rows;
  }

  static async markResultChecked(matchId, winnerId = null, matchResult = null) {
    const query = `
      UPDATE ongoing_matches 
      SET result_checked = TRUE,
          winner_id = $2,
          result = $3
      WHERE id = $1
      RETURNING *
    `;

    const queryResult = await pool.query(query, [matchId, winnerId, matchResult]);
    return queryResult.rows[0];
  }

  static async findByChallenge(challengeId) {
    const query = `
      SELECT * FROM ongoing_matches WHERE challenge_id = $1
    `;

    const result = await pool.query(query, [challengeId]);
    return result.rows[0];
  }
}

export default OngoingMatch;
