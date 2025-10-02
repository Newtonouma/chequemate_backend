import fetch from 'node-fetch';

class ChessMatchmaker {
  constructor() {
    this.ECO_CODES = [
      'A00', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09',
      'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19',
      // ... add more ECO codes as needed
      'E97', 'E98', 'E99'
    ];
    
    this.weights = {
      w_rating: 0.5,
      w_streak: 0.2,
      w_time: 0.2,
      w_style: 0.1
    };
  }

  /**
   * Fetch user's game history from Chess.com
   */
  async getUserMatches(username, months = 3) {
    try {
      // Get archive URLs
      const archivesResponse = await fetch(
        `https://api.chess.com/pub/player/${username}/games/archives`,
        {
          headers: {
            'User-Agent': 'ChessNexus/1.0 (contact@chessnexus.com)'
          }
        }
      );
      
      if (!archivesResponse.ok) {
        throw new Error(`Failed to fetch archives: ${archivesResponse.status}`);
      }
      
      const { archives } = await archivesResponse.json();
      const recentUrls = archives.slice(-months);
      
      let games = [];
      for (const url of recentUrls) {
        const monthResponse = await fetch(url, {
          headers: {
            'User-Agent': 'ChessNexus/1.0 (contact@chessnexus.com)'
          }
        });
        
        if (monthResponse.ok) {
          const monthData = await monthResponse.json();
          games.push(...(monthData.games || []));
        }
      }
      
      // Sort by end_time (most recent first)
      return games.sort((a, b) => b.end_time - a.end_time);
    } catch (error) {
      console.error(`Error fetching games for ${username}:`, error);
      return [];
    }
  }

  /**
   * Extract current rating from most recent game
   */
  getCurrentRating(username, games) {
    if (!games.length) return 1200; // Default rating
    
    const lastGame = games[0];
    const player = lastGame.white.username.toLowerCase() === username.toLowerCase() 
      ? lastGame.white 
      : lastGame.black;
    
    return player.rating || 1200;
  }

  /**
   * Calculate win/loss streak
   */
  getStreak(username, games, maxChecks = 10) {
    let streak = 0;
    const recentGames = games.slice(0, maxChecks);
    
    for (const game of recentGames) {
      const player = game.white.username.toLowerCase() === username.toLowerCase() 
        ? game.white 
        : game.black;
      
      const result = player.result;
      
      if (result === 'win') {
        streak = streak >= 0 ? streak + 1 : 1;
      } else if (['checkmated', 'timeout', 'resigned'].includes(result)) {
        streak = streak <= 0 ? streak - 1 : -1;
      } else {
        break; // Draw or other result breaks streak
      }
    }
    
    return streak;
  }

  /**
   * Analyze time control preferences
   */
  getTimePreferences(games) {
    const counts = {};
    
    for (const game of games) {
      const timeControl = game.time_control || 'unknown';
      counts[timeControl] = (counts[timeControl] || 0) + 1;
    }
    
    const total = Object.values(counts).reduce((sum, count) => sum + count, 0) || 1;
    const preferences = {};
    
    for (const [timeControl, count] of Object.entries(counts)) {
      preferences[timeControl] = count / total;
    }
    
    return preferences;
  }

  /**
   * Extract ECO codes from PGN and create style vector
   */
  getStyleVector(games) {
    const ecoCounts = {};
    
    for (const game of games) {
      if (game.pgn) {
        const ecoMatch = game.pgn.match(/\[ECO "([A-E]\d{2})"\]/);
        if (ecoMatch) {
          const ecoCode = ecoMatch[1];
          ecoCounts[ecoCode] = (ecoCounts[ecoCode] || 0) + 1;
        }
      }
    }
    
    const vector = this.ECO_CODES.map(code => ecoCounts[code] || 0);
    const sum = vector.reduce((a, b) => a + b, 0) || 1;
    
    return vector.map(count => count / sum);
  }

  /**
   * Calculate cosine similarity between two style vectors
   */
  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    const norm = Math.sqrt(normA) * Math.sqrt(normB);
    return norm === 0 ? 0 : dotProduct / norm;
  }

  /**
   * Score opponent compatibility
   */
  scoreOpponent(userFeatures, opponentFeatures) {
    // 1. Rating score (Gaussian)
    const ratingDiff = Math.abs(userFeatures.rating - opponentFeatures.rating);
    const ratingScore = Math.exp(-(ratingDiff ** 2) / (2 * (50 ** 2)));
    
    // 2. Streak smoothing
    const streakScore = Math.exp(-Math.abs(userFeatures.streak) / 5);
    
    // 3. Time control alignment
    let timeScore = 0;
    for (const [timeControl, userPref] of Object.entries(userFeatures.timePreferences)) {
      const opponentPref = opponentFeatures.timePreferences[timeControl] || 0;
      timeScore += userPref * opponentPref;
    }
    
    // 4. Style diversity (encourage variety)
    const styleSimilarity = this.cosineSimilarity(
      userFeatures.styleVector, 
      opponentFeatures.styleVector
    );
    const styleScore = 1 - styleSimilarity;
    
    // Weighted combination
    return (
      this.weights.w_rating * ratingScore +
      this.weights.w_streak * streakScore +
      this.weights.w_time * timeScore +
      this.weights.w_style * styleScore
    );
  }

  /**
   * Build features for a user
   */
  async buildUserFeatures(username, platform = 'chess.com') {
    if (platform !== 'chess.com') {
      throw new Error('Currently only Chess.com is supported');
    }
    
    const games = await this.getUserMatches(username);
    
    return {
      rating: this.getCurrentRating(username, games),
      streak: this.getStreak(username, games),
      timePreferences: this.getTimePreferences(games),
      styleVector: this.getStyleVector(games),
      gamesCount: games.length,
      lastPlayed: games.length > 0 ? new Date(games[0].end_time * 1000) : null
    };
  }

  /**
   * Find best opponent for a user
   */
  async findBestOpponent(challengerUsername, availableUsers, challengerPlatform = 'chess.com') {
    try {
      // Build features for challenger
      const challengerFeatures = await this.buildUserFeatures(challengerUsername, challengerPlatform);
      
      // Build features for all available opponents
      const candidates = [];
      
      for (const user of availableUsers) {
        if (user.username === challengerUsername) continue;
        
        try {
          const platformUsername = challengerPlatform === 'chess.com' 
            ? user.chessComUsername 
            : user.lichessUsername;
            
          if (!platformUsername) continue;
          
          const opponentFeatures = await this.buildUserFeatures(platformUsername, challengerPlatform);
          
          // Apply filters
          const ratingDiff = Math.abs(challengerFeatures.rating - opponentFeatures.rating);
          if (ratingDiff > 300) continue;
          
          // Check for common time controls
          const hasCommonTimeControl = Object.keys(challengerFeatures.timePreferences)
            .some(tc => opponentFeatures.timePreferences[tc] > 0);
          if (!hasCommonTimeControl) continue;
          
          const score = this.scoreOpponent(challengerFeatures, opponentFeatures);
          
          candidates.push({
            user,
            features: opponentFeatures,
            score,
            platformUsername
          });
          
        } catch (error) {
          console.error(`Error processing opponent ${user.username}:`, error);
        }
      }
      
      if (candidates.length === 0) {
        return null;
      }
      
      // Sort by score and return best match
      candidates.sort((a, b) => b.score - a.score);
      
      return {
        opponent: candidates[0].user,
        score: candidates[0].score,
        challengerFeatures,
        opponentFeatures: candidates[0].features,
        reasoning: this.explainMatch(challengerFeatures, candidates[0].features)
      };
      
    } catch (error) {
      console.error('Error in findBestOpponent:', error);
      return null;
    }
  }

  /**
   * Explain why two players were matched
   */
  explainMatch(challengerFeatures, opponentFeatures) {
    const ratingDiff = Math.abs(challengerFeatures.rating - opponentFeatures.rating);
    const reasons = [];
    
    if (ratingDiff < 50) {
      reasons.push('Very similar ratings');
    } else if (ratingDiff < 100) {
      reasons.push('Close ratings');
    }
    
    if (Math.abs(challengerFeatures.streak) < 2 && Math.abs(opponentFeatures.streak) < 2) {
      reasons.push('Both players in balanced form');
    }
    
    // Find common time controls
    const commonTimeControls = Object.keys(challengerFeatures.timePreferences)
      .filter(tc => opponentFeatures.timePreferences[tc] > 0.1);
    
    if (commonTimeControls.length > 0) {
      reasons.push(`Both prefer ${commonTimeControls[0]} games`);
    }
    
    return reasons.join(', ');
  }
}

export default ChessMatchmaker;
