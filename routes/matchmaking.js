import express from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import https from 'https';

const router = express.Router();

// In-memory cache for ratings (30 minutes expiry)
const ratingCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Function to fetch real rating from chess APIs
async function fetchChessRating(platform, username) {
  return new Promise((resolve) => {
    if (!username) {
      console.log('No username provided, returning default rating');
      resolve(1200); // Default rating
      return;
    }

    // Check cache first
    const cacheKey = `${platform}:${username.toLowerCase()}`;
    const cached = ratingCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      resolve(cached.rating);
      return;
    }

    const hostname = platform === 'chess.com' ? 'api.chess.com' : 'lichess.org';
    const path = platform === 'chess.com' 
      ? `/pub/player/${username.toLowerCase()}/stats`
      : `/api/user/${username}`;

    const options = {
      hostname,
      path,
      method: 'GET',
      timeout: 8000, // Increased timeout to 8 seconds
      headers: {
        'User-Agent': 'ChessNexus/1.0 (https://chess-nexus.com)',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            resolve(1200);
            return;
          }

          const parsed = JSON.parse(data);
          let rating = 1200; // Default

          if (platform === 'chess.com') {
            // Try different rating types in order of preference
            if (parsed.chess_rapid?.last?.rating) {
              rating = parsed.chess_rapid.last.rating;
            } else if (parsed.chess_blitz?.last?.rating) {
              rating = parsed.chess_blitz.last.rating;
            } else if (parsed.chess_bullet?.last?.rating) {
              rating = parsed.chess_bullet.last.rating;
            }
          } else if (platform === 'lichess.org') {
            // Try different rating types in order of preference
            if (parsed.perfs?.rapid?.rating) {
              rating = parsed.perfs.rapid.rating;
            } else if (parsed.perfs?.blitz?.rating) {
              rating = parsed.perfs.blitz.rating;
            } else if (parsed.perfs?.bullet?.rating) {
              rating = parsed.perfs.bullet.rating;
            }
          }

          // Cache the rating before resolving
          ratingCache.set(cacheKey, {
            rating,
            timestamp: Date.now()
          });

          resolve(rating);
        } catch (e) {
          console.error(`Error parsing response for ${username}:`, e.message);
          resolve(1200); // Default on error
        }
      });
    });

    req.on('error', (error) => {
      console.error(`Request error for ${username}:`, error.message);
      resolve(1200); // Default on error
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve(1200); // Default on timeout
    });
    
    req.end();
  });
}

// Get suggested opponents for matchmaking
router.get('/suggested', protect, async (req, res) => {
  try {
    // Get current user (already available from middleware)
    const currentUser = req.user;
    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get online users from the socket.io server
    // Access the onlineUsers from the app module (we'll need to pass this)
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers') || {};
    
    // Get list of online user IDs
    const onlineUserIds = Object.values(onlineUsers).map(user => user.id);
    console.log('Online user IDs:', onlineUserIds);
    
    // Get available opponents with same preferred platform
    const availableUsers = await User.findAvailableOpponents(
      currentUser.preferred_platform, 
      currentUser.id
    );
    
    console.log('Available opponents found:', availableUsers.length);
    
    // Filter to only include online users
    const onlineAvailableUsers = availableUsers.filter(user => 
      onlineUserIds.includes(user.id)
    );
    
    if (onlineAvailableUsers.length === 0) {
      return res.json({
        success: true,
        suggestions: [],
        message: 'No online users with same platform found'
      });
    }

    // Enhanced filtering and scoring for better suggestions
    const suggestions = [];
    
    for (const user of onlineAvailableUsers) {
      // Double-check: Exclude current user (should already be filtered by findAvailableOpponents)
      if (user.id === currentUser.id) {
        continue;
      }

      // Must have platform username
      const platformUsername = currentUser.preferred_platform === 'chess.com' 
        ? user.chess_com_username 
        : user.lichess_username;

      if (!platformUsername) {
        continue;
      }
      
      // Fetch real rating from chess API
      const rating = await fetchChessRating(currentUser.preferred_platform, platformUsername);
      
      suggestions.push({
        id: user.id,
        name: user.name,
        username: user.username,
        rating: rating,
        rank: rating < 800 ? 'Beginner' : rating < 1400 ? 'Intermediate' : rating < 2000 ? 'Advanced' : 'Expert',
        country: '🌍',
        avatar: user.name.split(' ').map(n => n[0]).join(''),
        platform: user.preferred_platform,
        platformUsername,
        slogan: user.slogan || 'Ready to Play!',
        // Simple scoring based on rating similarity
        score: 1000 - Math.abs(rating - 1200) // Favor ratings closer to 1200 for now
      });

      // Limit processing to avoid long delays
      if (suggestions.length >= 5) break;
    }

    // Sort by score and limit to 3
    const finalSuggestions = suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    console.log('Final suggestions:', finalSuggestions.length);
    console.log('Suggestions:', finalSuggestions.map(s => ({ username: s.username, platform: s.platform, platformUsername: s.platformUsername, rating: s.rating })));
    
    res.json({
      success: true,
      suggestions: finalSuggestions,
      debug: {
        currentUser: {
          id: currentUser.id,
          username: currentUser.username,
          platform: currentUser.preferred_platform
        },
        availableCount: availableUsers.length,
        filteredCount: finalSuggestions.length
      }
    });
    
  } catch (error) {
    console.error('Error getting suggested opponents:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting suggestions',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get real rating for a specific user
router.get('/rating/:platform/:username', async (req, res) => {
  try {
    const { platform, username } = req.params;
    
    if (!username || !platform) {
      return res.status(400).json({
        success: false,
        message: 'Platform and username are required'
      });
    }

    const rating = await fetchChessRating(platform, username);
    
    res.json({
      success: true,
      rating,
      platform,
      username
    });
  } catch (error) {
    console.error('Error in rating endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rating',
      error: error.message
    });
  }
});

// Clear cache endpoint for debugging
router.post('/clear-cache', (req, res) => {
  ratingCache.clear();
  console.log('Rating cache cleared');
  res.json({
    success: true,
    message: 'Rating cache cleared'
  });
});

export default router;
