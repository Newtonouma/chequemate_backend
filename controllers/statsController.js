import asyncHandler from 'express-async-handler';
import userStatsCache from '../services/UserStatsCache.js';

// @desc    Get user stats (cached)
// @route   GET /api/stats/user/:username
// @access  Public
export const getUserStats = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const { platform = 'chess.com', lightweight = false } = req.query;

  if (!username) {
    res.status(400);
    throw new Error('Username is required');
  }

  try {
    let stats;
    if (lightweight === 'true') {
      stats = await userStatsCache.getLightweightStats(username, platform);
    } else {
      stats = await userStatsCache.getUserStats(username, platform);
    }

    res.json({
      success: true,
      data: stats,
      cached: true
    });
  } catch (error) {
    console.error(`Error fetching stats for ${username}:`, error.message);
    res.status(500);
    throw new Error(`Failed to fetch stats for ${username}: ${error.message}`);
  }
});

// @desc    Get multiple user stats (for Play page)
// @route   POST /api/stats/users
// @access  Public
export const getMultipleUserStats = asyncHandler(async (req, res) => {
  const { usernames, platform = 'chess.com' } = req.body;

  if (!usernames || !Array.isArray(usernames)) {
    res.status(400);
    throw new Error('Usernames array is required');
  }

  if (usernames.length > 20) {
    res.status(400);
    throw new Error('Cannot fetch stats for more than 20 users at once');
  }

  try {
    const stats = await userStatsCache.preloadMultipleUserStats(usernames, platform);
    
    res.json({
      success: true,
      data: stats,
      cached: true,
      count: Object.keys(stats).length
    });
  } catch (error) {
    console.error(`Error fetching multiple user stats:`, error.message);
    res.status(500);
    throw new Error(`Failed to fetch user stats: ${error.message}`);
  }
});

// @desc    Clear user stats cache
// @route   DELETE /api/stats/user/:username
// @access  Public (in production, this should be protected)
export const clearUserStatsCache = asyncHandler(async (req, res) => {
  const { username } = req.params;
  const { platform = 'chess.com' } = req.query;

  if (!username) {
    res.status(400);
    throw new Error('Username is required');
  }

  userStatsCache.clearUserCache(username, platform);
  
  res.json({
    success: true,
    message: `Cache cleared for ${username}`
  });
});

// @desc    Get cache status
// @route   GET /api/stats/cache/status
// @access  Public (in production, this should be protected)
export const getCacheStatus = asyncHandler(async (req, res) => {
  const cacheStatus = userStatsCache.getStatus();
  const queueStatus = (await import('../services/ChessComApiQueue.js')).default.getStatus();
  
  res.json({
    success: true,
    data: {
      userCache: cacheStatus,
      apiQueue: queueStatus
    }
  });
});