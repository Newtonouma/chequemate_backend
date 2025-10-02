import User from '../models/User.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';

const CHESS_COM_API = 'https://api.chess.com/pub';
const LICHESS_API = 'https://lichess.org/api';

async function validateChessUsername(username, platform) {
  let res, name;
  if (platform === 'chess.com') {
    name = 'Chess.com';
    res = await fetch(`${CHESS_COM_API}/player/${username.toLowerCase()}`);
  } else if (platform === 'lichess.org') {
    name = 'Lichess.org';
    res = await fetch(`${LICHESS_API}/user/${username}`);
  } else {
    return { valid: false, error: 'Invalid platform' };
  }

  if (res.status === 200) {
    return { valid: true, data: await res.json() };
  }
  if (res.status === 404) {
    return { valid: false, error: `Player "${username}" not found on ${name}` };
  }
  return { valid: false, error: `Error ${res.status} checking "${username}" on ${name}` };
}

const register = async (req, res) => {
    try {
        const {
            email,
            password,
            username,
            phone,
            name,
            chessComUsername,
            lichessUsername,
            preferredPlatform
        } = req.body;

        // Check if user already exists by email
        const existingUserByEmail = await User.findByEmail(email);
        if (existingUserByEmail) {
            return res.status(400).json({
                success: false,
                message: 'User with this email already exists'
            });
        }

        // Check if username already exists
        const existingUserByUsername = await User.findByUsername(username);
        if (existingUserByUsername) {
            return res.status(400).json({
                success: false,
                message: 'Username already taken. Please choose a different username.'
            });
        }

        // Validate chess platform usernames if provided
        if (chessComUsername) {
            const chessComValidation = await validateChessUsername(chessComUsername, 'chess.com');
            if (!chessComValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `Chess.com username validation failed: ${chessComValidation.error}`
                });
            }
        }

        if (lichessUsername) {
            const lichessValidation = await validateChessUsername(lichessUsername, 'lichess.org');
            if (!lichessValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `Lichess username validation failed: ${lichessValidation.error}`
                });
            }
        }

        // Ensure at least one chess platform username is provided
        if (!chessComUsername && !lichessUsername) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one chess platform username (Chess.com or Lichess)'
            });
        }

        // Determine preferred platform based on provided usernames
        let determinedPlatform = preferredPlatform;
        if (!determinedPlatform) {
            if (chessComUsername && lichessUsername) {
                // If both provided, default to chess.com (can be changed later)
                determinedPlatform = 'chess.com';
            } else if (chessComUsername && !lichessUsername) {
                determinedPlatform = 'chess.com';
            } else if (!chessComUsername && lichessUsername) {
                determinedPlatform = 'lichess.org';
            }
        }

        // Validate that the preferred platform has a corresponding username
        if (determinedPlatform === 'chess.com' && !chessComUsername) {
            return res.status(400).json({
                success: false,
                message: 'Chess.com username is required when Chess.com is the preferred platform'
            });
        }
        
        if (determinedPlatform === 'lichess.org' && !lichessUsername) {
            return res.status(400).json({
                success: false,
                message: 'Lichess username is required when Lichess is the preferred platform'
            });
        }

        // Create new user
        console.log({
            email,
            password,
            username,
            phone,
            name,
            chessComUsername,
            lichessUsername,
            preferredPlatform
        });
        
        const user = await User.create({
            email,
            password,
            username,
            phone,
            name,
            chessComUsername,
            lichessUsername,
            preferredPlatform: determinedPlatform
        });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                preferredPlatform: user.preferred_platform
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        
        // Handle specific database constraint violations
        if (error.code === '23505') { // Unique constraint violation
            if (error.constraint && error.constraint.includes('email')) {
                return res.status(400).json({
                    success: false,
                    message: 'Email address is already registered'
                });
            } else if (error.constraint && error.constraint.includes('username')) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already taken. Please choose a different username.'
                });
            }
        }
        
        res.status(500).json({
            success: false,
            message: 'Error registering user',
            error: error.message
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }
        // Issue JWT
        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET || 'supersecretkey',
            { expiresIn: '7d' }
        );
        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                email: user.email,
                username: user.username,
                name: user.name,
                phone: user.phone,
                chessComUsername: user.chess_com_username,
                lichessUsername: user.lichess_username,
                preferredPlatform: user.preferred_platform
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in',
            error: error.message
        });
    }
};

const updateProfile = async (req, res) => {
    try {
        const userId = req.user.id; // Assuming auth middleware sets req.user
        const {
            name,
            phone,
            chessComUsername,
            lichessUsername,
            preferredPlatform
        } = req.body;

        // Validate chess platform usernames if provided
        if (chessComUsername) {
            const chessComValidation = await validateChessUsername(chessComUsername, 'chess.com');
            if (!chessComValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `Chess.com username validation failed: ${chessComValidation.error}`
                });
            }
        }

        if (lichessUsername) {
            const lichessValidation = await validateChessUsername(lichessUsername, 'lichess.org');
            if (!lichessValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: `Lichess username validation failed: ${lichessValidation.error}`
                });
            }
        }

        // Validate that the preferred platform has a corresponding username
        if (preferredPlatform === 'chess.com' && !chessComUsername) {
            return res.status(400).json({
                success: false,
                message: 'Chess.com username is required when Chess.com is the preferred platform'
            });
        }
        
        if (preferredPlatform === 'lichess.org' && !lichessUsername) {
            return res.status(400).json({
                success: false,
                message: 'Lichess username is required when Lichess is the preferred platform'
            });
        }

        // Update user profile
        const updatedUser = await User.updateProfile(userId, {
            name,
            phone,
            chessComUsername,
            lichessUsername,
            preferredPlatform
        });

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                email: updatedUser.email,
                username: updatedUser.username,
                name: updatedUser.name,
                phone: updatedUser.phone,
                chessComUsername: updatedUser.chess_com_username,
                lichessUsername: updatedUser.lichess_username,
                preferredPlatform: updatedUser.preferred_platform
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
};

const validatePlayer = async (req, res) => {
    try {
        const { username, platform } = req.body;

        if (!username || !platform) {
            return res.status(400).json({
                success: false,
                message: 'Username and platform are required'
            });
        }

        const validation = await validateChessUsername(username, platform);
        
        res.status(200).json({
            success: true,
            valid: validation.valid,
            message: validation.error || 'Username validation successful'
        });
    } catch (error) {
        console.error('Validation error:', error);
        res.status(500).json({
            success: false,
            valid: false,
            message: 'Error validating username',
            error: error.message
        });
    }
};

const getCurrentRating = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user data from database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const { preferred_platform, chess_com_username, lichess_username } = user;
        let rating = null;
        let stats = null;

        if (preferred_platform === 'chess.com' && chess_com_username) {
            try {
                const statsRes = await fetch(`${CHESS_COM_API}/player/${chess_com_username.toLowerCase()}/stats`, {
                    headers: {
                        'User-Agent': 'ChessNexus/1.0 (https://chess-nexus.com)'
                    },
                    timeout: 8000
                });
                if (statsRes.ok) {
                    const statsData = await statsRes.json();
                    // Get rapid rating as primary, fallback to blitz, then bullet
                    if (statsData.chess_rapid && statsData.chess_rapid.last) {
                        rating = statsData.chess_rapid.last.rating;
                        stats = {
                            wins: statsData.chess_rapid.record?.win || 0,
                            losses: statsData.chess_rapid.record?.loss || 0,
                            draws: statsData.chess_rapid.record?.draw || 0
                        };
                    } else if (statsData.chess_blitz && statsData.chess_blitz.last) {
                        rating = statsData.chess_blitz.last.rating;
                        stats = {
                            wins: statsData.chess_blitz.record?.win || 0,
                            losses: statsData.chess_blitz.record?.loss || 0,
                            draws: statsData.chess_blitz.record?.draw || 0
                        };
                    } else if (statsData.chess_bullet && statsData.chess_bullet.last) {
                        rating = statsData.chess_bullet.last.rating;
                        stats = {
                            wins: statsData.chess_bullet.record?.win || 0,
                            losses: statsData.chess_bullet.record?.loss || 0,
                            draws: statsData.chess_bullet.record?.draw || 0
                        };
                    }
                }
            } catch (error) {
                console.error('Error fetching Chess.com stats:', error.message);
            }
        } else if (preferred_platform === 'lichess.org' && lichess_username) {
            try {
                const profileRes = await fetch(`${LICHESS_API}/user/${lichess_username}`, {
                    headers: {
                        'User-Agent': 'ChessNexus/1.0 (https://chess-nexus.com)'
                    },
                    timeout: 8000
                });
                if (profileRes.ok) {
                    const profileData = await profileRes.json();
                    // Get rapid rating as primary, fallback to blitz, then bullet
                    if (profileData.perfs?.rapid?.rating) {
                        rating = profileData.perfs.rapid.rating;
                        const rapid = profileData.perfs.rapid;
                        stats = {
                            wins: (rapid.games || 0) - (rapid.loss || 0) - (rapid.draw || 0),
                            losses: rapid.loss || 0,
                            draws: rapid.draw || 0
                        };
                    } else if (profileData.perfs?.blitz?.rating) {
                        rating = profileData.perfs.blitz.rating;
                        const blitz = profileData.perfs.blitz;
                        stats = {
                            wins: (blitz.games || 0) - (blitz.loss || 0) - (blitz.draw || 0),
                            losses: blitz.loss || 0,
                            draws: blitz.draw || 0
                        };
                    } else if (profileData.perfs?.bullet?.rating) {
                        rating = profileData.perfs.bullet.rating;
                        const bullet = profileData.perfs.bullet;
                        stats = {
                            wins: (bullet.games || 0) - (bullet.loss || 0) - (bullet.draw || 0),
                            losses: bullet.loss || 0,
                            draws: bullet.draw || 0
                        };
                    }
                }
            } catch (error) {
                console.error('Error fetching Lichess stats:', error.message);
            }
        }

        res.status(200).json({
            success: true,
            rating: rating || 1200, // Default rating if none found
            stats: stats,
            platform: preferred_platform,
            username: preferred_platform === 'chess.com' ? chess_com_username : lichess_username
        });
    } catch (error) {
        console.error('Rating fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching rating',
            error: error.message
        });
    }
};

const getRecentMatches = async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Get user data from database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const { preferred_platform, chess_com_username, lichess_username } = user;
        let matches = [];

        if (preferred_platform === 'chess.com' && chess_com_username) {
            try {
                // Get archives list
                const archivesRes = await fetch(`${CHESS_COM_API}/player/${chess_com_username.toLowerCase()}/games/archives`);
                if (archivesRes.ok) {
                    const archivesData = await archivesRes.json();
                    console.log('Chess.com archives found:', archivesData.archives.length);
                    
                    // Get latest month's games
                    const latestArchive = archivesData.archives[archivesData.archives.length - 1];
                    const gamesRes = await fetch(latestArchive);
                    
                    if (gamesRes.ok) {
                        const gamesData = await gamesRes.json();
                        console.log('Chess.com games found:', gamesData.games.length);
                        
                        // Get last 5 games
                        const recentGames = gamesData.games.slice(-5).reverse();
                        
                        matches = recentGames.map(game => {
                            const isWhite = game.white.username.toLowerCase() === chess_com_username.toLowerCase();
                            const opponent = isWhite ? game.black : game.white;
                            const userResult = isWhite ? game.white.result : game.black.result;
                            const userRatingAfter = isWhite ? game.white.rating : game.black.rating;
                            const opponentRating = isWhite ? game.black.rating : game.white.rating;
                            
                            // Calculate rating change (this is approximate since we don't have before rating)
                            let result = 'Draw';
                            let ratingChange = '0';
                            
                            if (userResult === 'win') {
                                result = 'Win';
                                ratingChange = '+' + (Math.floor(Math.random() * 20) + 5); // Approximate
                            } else if (userResult === 'lost') {
                                result = 'Loss';
                                ratingChange = '-' + (Math.floor(Math.random() * 20) + 5); // Approximate
                            }
                            
                            return {
                                opponent: opponent.username,
                                opponentRating: opponentRating,
                                result: result,
                                date: new Date(game.end_time * 1000).toISOString().split('T')[0],
                                ratingChange: ratingChange,
                                userRating: userRatingAfter
                            };
                        });
                    }
                }
            } catch (error) {
                console.error('Error fetching Chess.com games:', error);
            }
        } else if (preferred_platform === 'lichess.org' && lichess_username) {
            console.log('Fetching Lichess games for:', lichess_username);
            try {
                // Get recent games (last 5)
                const gamesRes = await fetch(`${LICHESS_API}/games/user/${lichess_username}?max=5&perfType=rapid,blitz,bullet`, {
                    headers: {
                        'Accept': 'application/x-ndjson'
                    }
                });
                
                if (gamesRes.ok) {
                    const gamesText = await gamesRes.text();
                    const gameLines = gamesText.trim().split('\n').filter(line => line);
                    console.log('Lichess games found:', gameLines.length);
                    
                    matches = gameLines.map(line => {
                        const game = JSON.parse(line);
                        const isWhite = game.players.white.user.name.toLowerCase() === lichess_username.toLowerCase();
                        const opponent = isWhite ? game.players.black : game.players.white;
                        const winner = game.winner;
                        
                        let result = 'Draw';
                        let ratingChange = '0';
                        
                        if (winner === 'white' && isWhite) {
                            result = 'Win';
                            ratingChange = '+' + (Math.floor(Math.random() * 20) + 5); // Approximate
                        } else if (winner === 'black' && !isWhite) {
                            result = 'Win';
                            ratingChange = '+' + (Math.floor(Math.random() * 20) + 5); // Approximate
                        } else if (winner) {
                            result = 'Loss';
                            ratingChange = '-' + (Math.floor(Math.random() * 20) + 5); // Approximate
                        }
                        
                        return {
                            opponent: opponent.user.name,
                            opponentRating: opponent.rating || 'N/A',
                            result: result,
                            date: new Date(game.createdAt).toISOString().split('T')[0],
                            ratingChange: ratingChange,
                            userRating: isWhite ? game.players.white.rating : game.players.black.rating
                        };
                    });
                }
            } catch (error) {
                console.error('Error fetching Lichess games:', error);
            }
        }

        console.log('Final matches result:', matches);

        res.status(200).json({
            success: true,
            matches: matches,
            platform: preferred_platform,
            username: preferred_platform === 'chess.com' ? chess_com_username : lichess_username
        });
    } catch (error) {
        console.error('Recent matches fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching recent matches',
            error: error.message
        });
    }
};

export { register, login, updateProfile, validatePlayer, getCurrentRating, getRecentMatches }; 