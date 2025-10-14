import chessComApiQueue from './ChessComApiQueue.js';

class UserStatsCache {
  constructor() {
    this.cache = new Map(); // In-memory cache for user stats
    this.sessionUserStats = new Map(); // Cache for active session users
    this.cacheTTL = 60 * 60 * 1000; // 1 hour for user stats
    this.sessionTTL = 4 * 60 * 60 * 1000; // 4 hours for session stats
    
    console.log('📊 [USER_STATS_CACHE] Initialized user stats caching service');
    
    // Clean cache periodically
    setInterval(() => this.cleanExpiredCache(), 10 * 60 * 1000); // Every 10 minutes
  }

  // Clean expired cache entries
  cleanExpiredCache() {
    const now = Date.now();
    let cleaned = 0;
    
    // Clean main cache
    for (const [key, data] of this.cache.entries()) {
      if (now - data.timestamp > this.cacheTTL) {
        this.cache.delete(key);
        cleaned++;
      }
    }
    
    // Clean session cache
    for (const [key, data] of this.sessionUserStats.entries()) {
      if (now - data.timestamp > this.sessionTTL) {
        this.sessionUserStats.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 [USER_STATS_CACHE] Cleaned ${cleaned} expired entries. Cache: ${this.cache.size}, Sessions: ${this.sessionUserStats.size}`);
    }
  }

  // Get comprehensive user stats (used on login and profile pages)
  async getUserStats(username, platform = 'chess.com') {
    const cacheKey = `${platform}:${username.toLowerCase()}`;
    
    // Check session cache first (longer TTL)
    if (this.sessionUserStats.has(cacheKey)) {
      const sessionData = this.sessionUserStats.get(cacheKey);
      if (Date.now() - sessionData.timestamp < this.sessionTTL) {
        console.log(`📊 [USER_STATS_CACHE] Session cache hit for ${username}`);
        return sessionData.stats;
      }
    }
    
    // Check main cache
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < this.cacheTTL) {
        console.log(`📊 [USER_STATS_CACHE] Cache hit for ${username}`);
        return cachedData.stats;
      }
    }
    
    // Fetch fresh data
    try {
      console.log(`📊 [USER_STATS_CACHE] Fetching fresh stats for ${username}`);
      const stats = await this.fetchUserStatsFromAPI(username, platform);
      
      // Cache the results
      const cacheData = {
        timestamp: Date.now(),
        stats: stats
      };
      
      this.cache.set(cacheKey, cacheData);
      this.sessionUserStats.set(cacheKey, cacheData);
      
      return stats;
    } catch (error) {
      console.error(`❌ [USER_STATS_CACHE] Error fetching stats for ${username}:`, error.message);
      
      // Return cached data even if expired as fallback
      if (this.cache.has(cacheKey)) {
        console.log(`📊 [USER_STATS_CACHE] Returning expired cache for ${username} due to API error`);
        return this.cache.get(cacheKey).stats;
      }
      
      throw error;
    }
  }

  // Fetch user stats from Chess.com API
  async fetchUserStatsFromAPI(username, platform) {
    if (platform !== 'chess.com') {
      throw new Error('Only Chess.com platform is currently supported');
    }

    try {
      // Get player profile
      const profileResponse = await chessComApiQueue.request({
        method: 'get',
        url: `https://api.chess.com/pub/player/${username.toLowerCase()}`
      }, 'playerProfile');

      // Get player stats
      const statsResponse = await chessComApiQueue.request({
        method: 'get',
        url: `https://api.chess.com/pub/player/${username.toLowerCase()}/stats`
      }, 'playerStats');

      // Get recent games
      const recentGames = await this.fetchRecentGames(username);

      // Process and format the data
      const profile = profileResponse.data;
      const stats = statsResponse.data;

      return {
        profile: {
          username: profile.username,
          name: profile.name || profile.username,
          title: profile.title || null,
          followers: profile.followers || 0,
          country: profile.country ? profile.country.split('/').pop() : null,
          location: profile.location || null,
          joined: profile.joined ? new Date(profile.joined * 1000).toISOString() : null,
          avatar: profile.avatar || null,
          verified: profile.verified || false
        },
        ratings: {
          rapid: stats.chess_rapid ? {
            last: stats.chess_rapid.last?.rating || null,
            best: stats.chess_rapid.best?.rating || null,
            record: stats.chess_rapid.record || null
          } : null,
          blitz: stats.chess_blitz ? {
            last: stats.chess_blitz.last?.rating || null,
            best: stats.chess_blitz.best?.rating || null,
            record: stats.chess_blitz.record || null
          } : null,
          bullet: stats.chess_bullet ? {
            last: stats.chess_bullet.last?.rating || null,
            best: stats.chess_bullet.best?.rating || null,
            record: stats.chess_bullet.record || null
          } : null,
          daily: stats.chess_daily ? {
            last: stats.chess_daily.last?.rating || null,
            best: stats.chess_daily.best?.rating || null,
            record: stats.chess_daily.record || null
          } : null
        },
        recentGames: recentGames,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ [USER_STATS_CACHE] API error for ${username}:`, error.message);
      throw error;
    }
  }

  // Fetch recent games for a user
  async fetchRecentGames(username, limit = 10) {
    try {
      // Get current date for the most recent month
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
      
      const response = await chessComApiQueue.request({
        method: 'get',
        url: `https://api.chess.com/pub/player/${username.toLowerCase()}/games/${currentYear}/${currentMonth}`
      }, 'monthlyGames');
      
      const games = response.data.games || [];
      
      // Get last N games and format them, most recent first
      const recentGames = games.slice(-limit).reverse().map(game => {
        const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
        const opponent = isWhite ? game.black : game.white;
        const playerData = isWhite ? game.white : game.black;
        let result = 'draw';
        
        if (game.white.result === 'win') {
          result = isWhite ? 'win' : 'loss';
        } else if (game.black.result === 'win') {
          result = isWhite ? 'loss' : 'win';
        }
        
        return {
          opponent: opponent.username,
          opponentRating: opponent.rating,
          result: result,
          playerRating: playerData.rating,
          timeControl: game.time_class,
          endTime: new Date(game.end_time * 1000).toISOString(),
          url: game.url
        };
      });
      
      return recentGames;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // Try previous month if current month has no games
        try {
          const now = new Date();
          const prevMonth = now.getMonth() === 0 ? 12 : now.getMonth();
          const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
          
          const prevResponse = await chessComApiQueue.request({
            method: 'get',
            url: `https://api.chess.com/pub/player/${username.toLowerCase()}/games/${prevYear}/${String(prevMonth).padStart(2, '0')}`
          }, 'monthlyGames');
          
          const prevGames = prevResponse.data.games || [];
          return prevGames.slice(-limit).reverse().map(game => {
            const isWhite = game.white.username.toLowerCase() === username.toLowerCase();
            const opponent = isWhite ? game.black : game.white;
            const playerData = isWhite ? game.white : game.black;
            let result = 'draw';
            
            if (game.white.result === 'win') {
              result = isWhite ? 'win' : 'loss';
            } else if (game.black.result === 'win') {
              result = isWhite ? 'loss' : 'win';
            }
            
            return {
              opponent: opponent.username,
              opponentRating: opponent.rating,
              result: result,
              playerRating: playerData.rating,
              timeControl: game.time_class,
              endTime: new Date(game.end_time * 1000).toISOString(),
              url: game.url
            };
          });
        } catch (prevError) {
          console.error(`Error fetching previous month games for ${username}:`, prevError.message);
          return [];
        }
      }
      
      console.error(`Error fetching recent games for ${username}:`, error.message);
      return [];
    }
  }

  // Get lightweight stats for Play page (ratings only)
  async getLightweightStats(username, platform = 'chess.com') {
    const cacheKey = `${platform}:${username.toLowerCase()}`;
    
    // Check if we have any cached data
    if (this.sessionUserStats.has(cacheKey)) {
      const sessionData = this.sessionUserStats.get(cacheKey);
      if (Date.now() - sessionData.timestamp < this.sessionTTL) {
        console.log(`📊 [USER_STATS_CACHE] Session lightweight cache hit for ${username}`);
        return {
          username: sessionData.stats.profile.username,
          ratings: sessionData.stats.ratings
        };
      }
    }
    
    if (this.cache.has(cacheKey)) {
      const cachedData = this.cache.get(cacheKey);
      if (Date.now() - cachedData.timestamp < this.cacheTTL) {
        console.log(`📊 [USER_STATS_CACHE] Lightweight cache hit for ${username}`);
        return {
          username: cachedData.stats.profile.username,
          ratings: cachedData.stats.ratings
        };
      }
    }
    
    // If no cache, fetch minimal data
    try {
      console.log(`📊 [USER_STATS_CACHE] Fetching lightweight stats for ${username}`);
      
      const statsResponse = await chessComApiQueue.request({
        method: 'get',
        url: `https://api.chess.com/pub/player/${username.toLowerCase()}/stats`
      }, 'playerStats');

      const stats = statsResponse.data;
      const lightweightData = {
        username: username,
        ratings: {
          rapid: stats.chess_rapid ? {
            last: stats.chess_rapid.last?.rating || null,
            best: stats.chess_rapid.best?.rating || null
          } : null,
          blitz: stats.chess_blitz ? {
            last: stats.chess_blitz.last?.rating || null,
            best: stats.chess_blitz.best?.rating || null
          } : null,
          bullet: stats.chess_bullet ? {
            last: stats.chess_bullet.last?.rating || null,
            best: stats.chess_bullet.best?.rating || null
          } : null
        }
      };
      
      // Cache lightweight data
      const cacheData = {
        timestamp: Date.now(),
        stats: {
          profile: { username: username },
          ratings: lightweightData.ratings,
          recentGames: []
        }
      };
      
      this.cache.set(cacheKey, cacheData);
      this.sessionUserStats.set(cacheKey, cacheData);
      
      return lightweightData;
    } catch (error) {
      console.error(`❌ [USER_STATS_CACHE] Error fetching lightweight stats for ${username}:`, error.message);
      throw error;
    }
  }

  // Preload stats for multiple users (for Play page)
  async preloadMultipleUserStats(usernames, platform = 'chess.com') {
    const results = {};
    const uncachedUsers = [];
    
    // Check which users need fresh data
    for (const username of usernames) {
      const cacheKey = `${platform}:${username.toLowerCase()}`;
      
      if (this.sessionUserStats.has(cacheKey)) {
        const sessionData = this.sessionUserStats.get(cacheKey);
        if (Date.now() - sessionData.timestamp < this.sessionTTL) {
          results[username] = {
            username: sessionData.stats.profile.username,
            ratings: sessionData.stats.ratings
          };
          continue;
        }
      }
      
      if (this.cache.has(cacheKey)) {
        const cachedData = this.cache.get(cacheKey);
        if (Date.now() - cachedData.timestamp < this.cacheTTL) {
          results[username] = {
            username: cachedData.stats.profile.username,
            ratings: cachedData.stats.ratings
          };
          continue;
        }
      }
      
      uncachedUsers.push(username);
    }
    
    // Fetch uncached users sequentially (respecting Chess.com API limits)
    for (const username of uncachedUsers) {
      try {
        const stats = await this.getLightweightStats(username, platform);
        results[username] = stats;
      } catch (error) {
        console.error(`Error loading stats for ${username}:`, error.message);
        results[username] = { username, ratings: {}, error: error.message };
      }
    }
    
    console.log(`📊 [USER_STATS_CACHE] Preloaded stats for ${usernames.length} users (${Object.keys(results).length} successful)`);
    return results;
  }

  // Clear cache for a specific user
  clearUserCache(username, platform = 'chess.com') {
    const cacheKey = `${platform}:${username.toLowerCase()}`;
    this.cache.delete(cacheKey);
    this.sessionUserStats.delete(cacheKey);
    console.log(`🗑️ [USER_STATS_CACHE] Cleared cache for ${username}`);
  }

  // Get cache status
  getStatus() {
    return {
      cacheSize: this.cache.size,
      sessionCacheSize: this.sessionUserStats.size,
      totalMemoryUsage: `~${(this.cache.size + this.sessionUserStats.size) * 2} KB`,
      cacheTTL: this.cacheTTL / 1000 / 60, // minutes
      sessionTTL: this.sessionTTL / 1000 / 60 // minutes
    };
  }

  // Cleanup method
  cleanup() {
    this.cache.clear();
    this.sessionUserStats.clear();
    console.log('✅ [USER_STATS_CACHE] Cleanup completed');
  }
}

// Create singleton instance
const userStatsCache = new UserStatsCache();

// Graceful shutdown handling
process.on('SIGTERM', () => userStatsCache.cleanup());
process.on('SIGINT', () => userStatsCache.cleanup());

export default userStatsCache;