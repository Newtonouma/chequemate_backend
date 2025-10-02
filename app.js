import express from 'express';
import dotenv from 'dotenv';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import pool from './config/database.js';
import Challenge from './models/Challenge.js';
import OngoingMatch from './models/OngoingMatch.js';
// OLD: import MatchResultChecker from './services/MatchResultChecker.js'; // Replaced by PerMatchResultChecker
import PerMatchResultChecker from './services/PerMatchResultChecker.js';
import paymentService from './services/paymentService.js';

import authRoutes from './routes/auth.js';
import challengeRoutes from './routes/challengeRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import userRoutes from './routes/userRoutes.js';
import matchmakingRoutes from './routes/matchmaking.js';
import matchResultRoutes from './routes/matchResultRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.set('socketio', io);

// In-memory store for online users
const onlineUsers = {};
app.set('io', io);
app.set('onlineUsers', onlineUsers);

io.on('connection', (socket) => {
  socket.on('user-online', (user) => {
    if (user && user.id) {
      console.log('User joining room:', user.id, 'with socket:', socket.id);
      socket.join(user.id.toString());
      onlineUsers[socket.id] = { ...user, socketId: socket.id };
      io.emit('online-users', Object.values(onlineUsers));
      
      // Test room functionality by sending a welcome message to the specific user
      setTimeout(() => {
        io.to(user.id.toString()).emit('test-room-message', {
          message: `Welcome ${user.username}! Your socket room is working.`,
          userId: user.id
        });
      }, 1000);
    }
  });

  // Handle challenge events
  socket.on('challenge', async (data) => {
    try {
      const { from, to } = data;
      
      // Extract time control from either time_control field or timeConfig object
      let timeControl = data.time_control || '10+0';
      if (data.timeConfig) {
        timeControl = `${data.timeConfig.timeMinutes}+${data.timeConfig.incrementSeconds}`;
      }
      
      // Create challenge in database with payment details
      const challengeData = {
        challenger: from.id,
        opponent: to.id,
        platform: data.platform || 'chess.com', // Default to chess.com if not provided
        time_control: timeControl,
        rules: data.rules || 'chess'
      };

        // Add payment details if present
        if (data.paymentDetails && data.paymentDetails.amount > 0) {
          challengeData.bet_amount = data.paymentDetails.amount;
          challengeData.payment_status = 'pending';
          challengeData.challenger_phone = data.paymentDetails.phoneNumber;
          console.log(`💰 [CHALLENGE] Payment challenge created:`, {
            amount: data.paymentDetails.amount,
            challengerPhone: data.paymentDetails.phoneNumber,
            challengeId: 'will be generated'
          });
        }      const challenge = await Challenge.create(challengeData);

      // Format challenge object to match frontend expectations
      const challengeForFrontend = {
        id: challenge.id,
        challenger: {
          id: from.id,
          username: from.username,
          name: from.name,
          preferred_platform: from.preferred_platform
        },
        opponent: {
          id: to.id,
          username: to.username,
          name: to.name,
          preferred_platform: to.preferred_platform
        },
        platform: challenge.platform,
        time_control: challenge.time_control,
        rules: challenge.rules,
        status: challenge.status,
        createdAt: challenge.created_at,
        // Pass through additional time configuration data for frontend
        timeConfig: data.timeConfig,
        challengeUrl: data.challengeUrl,
        paymentDetails: data.paymentDetails
      };

      // Emit to the opponent that they have a new challenge
      console.log('Emitting newChallenge to opponent:', to.id, challengeForFrontend);
      io.to(to.id.toString()).emit('newChallenge', challengeForFrontend);
      
      // Emit to the challenger that their challenge was sent
      console.log('Emitting challengeSent to challenger:', from.id, challengeForFrontend);
      io.to(from.id.toString()).emit('challengeSent', challengeForFrontend);
      
      console.log('Challenge created and emitted:', challengeForFrontend);
    } catch (error) {
      console.error('Error creating challenge:', error);
    }
  });

  // Handle challenge acceptance via socket
  socket.on('challenge-accept', async (data) => {
    try {
      console.log(`🎯 [SOCKET] Challenge acceptance received:`, data);
      
      // Find the challenge in the database based on the participants and timestamp
      const challengeQuery = await pool.query(`
        SELECT c.*, 
               challenger_user.username as challenger_username, challenger_user.phone as challenger_phone,
               opponent_user.username as opponent_username, opponent_user.phone as opponent_phone
        FROM challenges c
        JOIN users challenger_user ON c.challenger = challenger_user.id
        JOIN users opponent_user ON c.opponent = opponent_user.id
        WHERE c.challenger = $1 AND c.opponent = $2 AND c.status = 'pending'
        ORDER BY c.created_at DESC
        LIMIT 1
      `, [data.from.id, data.to.id]);

      if (challengeQuery.rows.length === 0) {
        console.error(`❌ [SOCKET] No pending challenge found between users ${data.from.id} and ${data.to.id}`);
        return;
      }

      const challenge = challengeQuery.rows[0];
      console.log(`📋 [SOCKET] Found challenge:`, {
        id: challenge.id,
        bet_amount: challenge.bet_amount,
        payment_status: challenge.payment_status,
        challenger_phone: challenge.challenger_phone,
        opponent_phone: challenge.opponent_phone
      });

      // Update challenge status to accepted and save opponent phone
      console.log(`🔧 [CHALLENGE_ACCEPT] Debug phone number logic:`, {
        providedOpponentPhone: data.opponentPhoneNumber,
        challengeOpponentPhone: challenge.opponent_phone,
        challengeBetAmount: challenge.bet_amount,
        challengeId: challenge.id
      });
      
      let opponentPhoneToSave = data.opponentPhoneNumber || challenge.opponent_phone;
      
      console.log(`� [CHALLENGE_ACCEPT] Opponent phone to save: ${opponentPhoneToSave}`);
      
      if (opponentPhoneToSave) {
        console.log(`🔧 [CHALLENGE_ACCEPT] Executing UPDATE query with phone: ${opponentPhoneToSave}, challengeId: ${challenge.id}`);
        const updateResult = await pool.query(
          'UPDATE challenges SET status = $1, opponent_phone = $2 WHERE id = $3 RETURNING *',
          ['accepted', opponentPhoneToSave, challenge.id]
        );
        console.log(`📱 [CHALLENGE_ACCEPT] UPDATE result:`, updateResult.rows[0]);
        console.log(`📱 [CHALLENGE_ACCEPT] Saved opponent phone number: ${opponentPhoneToSave}`);
      } else {
        await pool.query('UPDATE challenges SET status = $1 WHERE id = $2', ['accepted', challenge.id]);
        console.log(`⚠️  [CHALLENGE_ACCEPT] No opponent phone number available for payment challenge!`);
      }

      // If this is a payment challenge, initiate deposits
      if (challenge.bet_amount && challenge.bet_amount > 0) {
        console.log(`💳 [SOCKET] Processing payment challenge with amount: ${challenge.bet_amount}`);
        
        // Get phone numbers - prioritize challenger_phone from database
        const challengerPhone = challenge.challenger_phone || data.paymentDetails?.phoneNumber;
        const opponentPhone = challenge.opponent_phone || data.opponentPhoneNumber;

        console.log(`📞 [SOCKET] Phone numbers:`, {
          challengerPhone,
          opponentPhone,
          challengerPhoneFromDB: challenge.challenger_phone,
          opponentPhoneFromDB: challenge.opponent_phone,
          fromPaymentDetails: data.paymentDetails?.phoneNumber,
          fromSocketOpponent: data.opponentPhoneNumber
        });

        // Note: Payment initiation has been moved to the game-redirect handler
        // This ensures payments are only triggered when players actually start playing
        console.log(`💡 [SOCKET] Payment initiation will occur when players redirect to chess platform`);
      }

      // Emit to the challenger that challenge was accepted
      const notificationData = {
        challengeId: challenge.id,
        challengerId: challenge.challenger,
        challengerUsername: challenge.challenger_username,
        accepterUsername: challenge.opponent_username,
        hasPayment: challenge.bet_amount > 0,
        paymentAmount: challenge.bet_amount
      };
      
      console.log(`📡 [SOCKET] Emitting challengeAccepted to challenger:`, data.from.id);
      io.to(data.from.id.toString()).emit('challengeAccepted', notificationData);

    } catch (error) {
      console.error(`❌ [SOCKET] Error handling challenge acceptance:`, error);
    }
  });

  socket.on('challenge-decline', async (data) => {
    try {
      const { challengeId, challengerId, challengedId } = data;
      
      // Update challenge status in database
      await Challenge.updateStatus(challengeId, 'declined');
      
      // Emit to challenger that challenge was declined
      const declineData = {
        challengeId,
        challengerId,
        challengedId
      };
      
      console.log('Emitting challenge-declined to challenger:', challengerId, declineData);
      io.to(challengerId.toString()).emit('challenge-declined', declineData);
      
      console.log('Challenge declined:', data);
    } catch (error) {
      console.error('Error declining challenge:', error);
    }
  });

  socket.on('challenge-cancel', async (data) => {
    try {
      const { challengeId, challengerId, challengedId } = data;
      
      // Update challenge status in database
      await Challenge.updateStatus(challengeId, 'cancelled');
      
      // Emit to both users that challenge was cancelled
      const cancelData = {
        challengeId,
        challengerId,
        challengedId
      };
      
      console.log('Emitting challenge-cancelled to both users:', cancelData);
      io.to(challengerId.toString()).emit('challenge-cancelled', cancelData);
      io.to(challengedId.toString()).emit('challenge-cancelled', cancelData);
      
      console.log('Challenge cancelled:', data);
    } catch (error) {
      console.error('Error cancelling challenge:', error);
    }
  });

  socket.on('challenge-postpone', async (data) => {
    try {
      const { challengeId, challengerId, challengedId, postponedBy } = data;
      
      // Update challenge status to postponed
      await Challenge.updateStatus(challengeId, 'postponed');
      
      // Add to postponed challenges table
      await pool.query(`
        INSERT INTO postponed_challenges (challenge_id, postponed_by)
        VALUES ($1, $2)
      `, [challengeId, postponedBy]);
      
      // Emit to both users that challenge was postponed
      const postponeData = {
        challengeId,
        challengerId,
        challengedId,
        postponedBy
      };
      
      console.log('Emitting challenge-postponed to both users:', postponeData);
      
      // Send to both challenger and challenged user
      io.to(challengerId.toString()).emit('challenge-postponed', postponeData);
      io.to(challengedId.toString()).emit('challenge-postponed', postponeData);
      
      console.log('Challenge postponed:', data);
    } catch (error) {
      console.error('Error postponing challenge:', error);
    }
  });

  socket.on('game-redirect', async (data) => {
    try {
      const { challengeId, challengerId, challengedId, redirectedBy, platform } = data;
      
      console.log(`🎮 [${new Date().toISOString()}] Received game-redirect event:`, {
        challengeId,
        challengerId,
        challengedId,
        redirectedBy,
        platform
      });
      
      // Get challenge data by ID directly with optimized query
      const challengeQuery = await pool.query(`
        SELECT c.id, c.challenger, c.opponent, c.platform, c.status, c.bet_amount, c.challenger_phone, c.opponent_phone,
               c.time_control, challenger_user.username as challenger_username,
               opponent_user.username as opponent_username
        FROM challenges c
        JOIN users challenger_user ON c.challenger = challenger_user.id
        JOIN users opponent_user ON c.opponent = opponent_user.id
        WHERE c.id = $1
      `, [challengeId]);
      
      if (challengeQuery.rows.length > 0) {
        const challengeData = challengeQuery.rows[0];
        
        console.log(`🔍 [${new Date().toISOString()}] Found challenge ${challengeId}:`, {
          id: challengeData.id,
          challengerId: challengeData.challenger,
          challengerUsername: challengeData.challenger_username,
          opponentId: challengeData.opponent,
          opponentUsername: challengeData.opponent_username,
          platform: challengeData.platform,
          status: challengeData.status,
          betAmount: challengeData.bet_amount,
          challengerPhone: challengeData.challenger_phone,
          opponentPhone: challengeData.opponent_phone,
          allFields: Object.keys(challengeData)
        });
        
        const redirectedUser = redirectedBy === challengeData.challenger ? challengeData.challenger_username : challengeData.opponent_username;
        const otherUserId = redirectedBy === challengeData.challenger ? challengeData.opponent : challengeData.challenger;
        const isChallenger = redirectedBy === challengeData.challenger;
        
        console.log(`👤 [${new Date().toISOString()}] User ${redirectedUser} (ID: ${redirectedBy}) redirected to ${platform}`);

        // 💰 CRITICAL: Initiate payment when player redirects to chess.com
        if (challengeData.bet_amount > 0) {
          if (isChallenger && challengeData.challenger_phone) {
            console.log(`💰 Initiating deposit for challenger: ${challengeData.challenger_phone}, amount: ${challengeData.bet_amount}`);
            try {
              const paymentResult = await paymentService.initiateDeposit(
                challengeData.challenger_phone, 
                challengeData.bet_amount,
                challengeData.challenger,
                challengeData.id
              );
              console.log(`💰 Challenger payment initiation result:`, paymentResult.success ? 'SUCCESS' : 'FAILED', paymentResult.error || '');
            } catch (paymentError) {
              console.error(`❌ Challenger payment initiation error:`, paymentError);
            }
          }
          
          if (!isChallenger && challengeData.opponent_phone) {
            console.log(`💰 Initiating deposit for opponent: ${challengeData.opponent_phone}, amount: ${challengeData.bet_amount}`);
            try {
              const paymentResult = await paymentService.initiateDeposit(
                challengeData.opponent_phone, 
                challengeData.bet_amount,
                challengeData.opponent,
                challengeData.id
              );
              console.log(`💰 Opponent payment initiation result:`, paymentResult.success ? 'SUCCESS' : 'FAILED', paymentResult.error || '');
            } catch (paymentError) {
              console.error(`❌ Opponent payment initiation error:`, paymentError);
            }
          }
        }
        
        const redirectData = {
          challengeId,
          challengerId: challengeData.challenger,
          challengedId: challengeData.opponent,
          redirectedBy,
          redirectedUser,
          platform,
          // Include time configuration data
          timeConfig: challengeData.timeConfig || null,
          challengeUrl: challengeData.challengeUrl || null,
          time_control: challengeData.time_control || null
        };

        console.log(`📡 [${new Date().toISOString()}] Emitting player-redirected to user:`, otherUserId, redirectData);
        
        // Notify specifically the other user that someone has redirected to the platform
        io.to(otherUserId.toString()).emit('player-redirected', redirectData);
        
        // Create or update ongoing match tracking (async without blocking)
        setImmediate(async () => {
          try {
            const existingMatch = await OngoingMatch.findByChallenge(challengeId);
            
            if (existingMatch) {
              console.log(`🔄 [${new Date().toISOString()}] Found existing ongoing match ${existingMatch.id} for challenge ${challengeId}`);
              
              console.log(`🎯 [${new Date().toISOString()}] User ${redirectedUser} is ${isChallenger ? 'challenger' : 'opponent'}`);
              
              const updatedMatch = await OngoingMatch.updateRedirection(challengeId, redirectedBy, isChallenger);
              
              console.log(`✅ [${new Date().toISOString()}] Updated redirection for match ${existingMatch.id}:`, {
                challengerRedirected: updatedMatch.challenger_redirected,
                opponentRedirected: updatedMatch.opponent_redirected,
                bothRedirected: updatedMatch.both_redirected,
                matchStartedAt: updatedMatch.match_started_at
              });

              // 🎯 START PER-MATCH RESULT CHECKING - If both players have redirected
              if (updatedMatch.both_redirected) {
                console.log(`🚀 [PER_MATCH_CHECKER] Both players redirected for match ${existingMatch.id}, starting per-match checker`);
                PerMatchResultChecker.startCheckingMatch({
                  matchId: existingMatch.id,
                  timeControl: challengeData.time_control,
                  startedAt: new Date(),
                  challenger: challengeData.challenger_username,
                  opponent: challengeData.opponent_username,
                  platform: challengeData.platform
                });
              }
            } else {
              console.log(`🆕 [${new Date().toISOString()}] Creating new ongoing match for challenge ${challengeId}`);
              
              const matchData = {
                challengeId: parseInt(challengeId),
                challengerId: challengeData.challenger,
                opponentId: challengeData.opponent,
                platform: platform,
                challengerUsername: challengeData.challenger_username,
                opponentUsername: challengeData.opponent_username
              };
              
              const newMatch = await OngoingMatch.create(matchData);
              console.log(`🎯 [${new Date().toISOString()}] Created new ongoing match:`, {
                matchId: newMatch.id,
                challengeId: newMatch.challenge_id,
                challenger: `${newMatch.challenger_username} (ID: ${newMatch.challenger_id})`,
                opponent: `${newMatch.opponent_username} (ID: ${newMatch.opponent_id})`,
                platform: newMatch.platform
              });
              
              console.log(`🎯 [${new Date().toISOString()}] User ${redirectedUser} is ${isChallenger ? 'challenger' : 'opponent'}`);
              
              const updatedMatch = await OngoingMatch.updateRedirection(challengeId, redirectedBy, isChallenger);
              
              console.log(`✅ [${new Date().toISOString()}] Updated redirection for new match ${newMatch.id}:`, {
                challengerRedirected: updatedMatch.challenger_redirected,
                opponentRedirected: updatedMatch.opponent_redirected,
                bothRedirected: updatedMatch.both_redirected,
                matchStartedAt: updatedMatch.match_started_at
              });

              // 🎯 START PER-MATCH RESULT CHECKING - If both players have redirected
              if (updatedMatch.both_redirected) {
                console.log(`🚀 [PER_MATCH_CHECKER] Both players redirected for new match ${newMatch.id}, starting per-match checker`);
                PerMatchResultChecker.startCheckingMatch({
                  matchId: newMatch.id,
                  timeControl: challengeData.time_control,
                  startedAt: new Date(),
                  challenger: challengeData.challenger_username,
                  opponent: challengeData.opponent_username,
                  platform: challengeData.platform
                });
              }
            }
          } catch (trackingError) {
            console.error(`❌ [${new Date().toISOString()}] Error tracking match:`, trackingError);
          }
        });
        
        console.log(`🎮 [${new Date().toISOString()}] Player ${redirectedUser} redirected to platform: ${platform}`);
      } else {
        console.error(`❌ [${new Date().toISOString()}] Challenge ${challengeId} not found in database`);
      }
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Error handling game redirect:`, error);
    }
  });  socket.on('game-start', async (data) => {
    try {
      const { challengeId, challengerId, challengedId, platform } = data;
      
      // Update challenge status in database
      await Challenge.updateStatus(challengeId, 'started');
      
      // Emit to both users that game has started
      const gameStartData = {
        challengeId,
        platform
      };
      
      console.log('Emitting game-started to both users:', gameStartData);
      io.to(challengerId.toString()).emit('game-started', gameStartData);
      io.to(challengedId.toString()).emit('game-started', gameStartData);
      
      console.log('Game started:', data);
    } catch (error) {
      console.error('Error starting game:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    const disconnectedUser = onlineUsers[socket.id];
    if (disconnectedUser) {
      console.log('Disconnected user:', disconnectedUser.username, disconnectedUser.id);
    }
    delete onlineUsers[socket.id];
    io.emit('online-users', Object.values(onlineUsers));
  });
});

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/users', userRoutes);
app.use('/api/matchmaking', matchmakingRoutes);
app.use('/api/match-results', matchResultRoutes);
app.use('/api/payments', paymentRoutes);

// Per-match checker status endpoint
app.get('/api/match-checker/status', (req, res) => {
  try {
    const status = PerMatchResultChecker.getStatus();
    res.json({
      success: true,
      perMatchChecker: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    error: err.message,
  });
});

const PORT = process.env.PORT || 3001;

// Test PostgreSQL connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error acquiring client', err.stack);
  }
  client.query('SELECT NOW()', (err, result) => {
    release();
    if (err) {
      return console.error('Error executing query', err.stack);
    }
    console.log('PostgreSQL connected:', result.rows);
  });
});

// Cleanup handlers for graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, cleaning up...');
  PerMatchResultChecker.cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, cleaning up...');
  PerMatchResultChecker.cleanup();
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // OLD: Initialize match result checker (replaced by PerMatchResultChecker)
  // const matchChecker = new MatchResultChecker(io);
  console.log('🎯 Per-match result checking system ready (old backup checker disabled)');
  
  // Initialize checkers for existing matches that need result checking
  initializeExistingMatches();
});

// Initialize checkers for matches that are waiting for results after server restart
async function initializeExistingMatches() {
  try {
    console.log('🔄 [STARTUP] Checking for existing matches that need result checking...');
    
    // First, verify that the ongoing_matches table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ongoing_matches'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.error('❌ [STARTUP] ongoing_matches table does not exist! Database may not be properly initialized.');
      console.error('💡 [STARTUP] Please run database initialization: npm run db:initialize');
      return;
    }
    
    // First, let's check what data types we're working with
    console.log('🔍 [STARTUP] Checking database schema...');
    
    try {
      // Check if there are any ongoing matches first
      const matchCount = await pool.query('SELECT COUNT(*) FROM ongoing_matches WHERE both_redirected = true AND result_checked = false');
      console.log(`📊 [STARTUP] Found ${matchCount.rows[0].count} matches needing result checking`);
      
      if (parseInt(matchCount.rows[0].count) === 0) {
        console.log('✅ [STARTUP] No existing matches need result checking');
        return;
      }
      
      // Get the matches with explicit casting to handle potential type mismatches
      const existingMatches = await pool.query(`
        SELECT 
          om.id as match_id,
          om.match_started_at,
          om.challenger_id,
          om.opponent_id,
          om.platform,
          om.challenger_username,
          om.opponent_username,
          COALESCE(c.time_control, '5+0') as time_control
        FROM ongoing_matches om
        LEFT JOIN challenges c ON om.challenge_id::text = c.id::text
        WHERE om.both_redirected = true 
          AND om.result_checked = false
          AND om.match_started_at IS NOT NULL
      `);
      
      if (existingMatches.rows.length === 0) {
        console.log('✅ [STARTUP] No existing matches need result checking');
        return;
      }
    } catch (queryError) {
      console.error('❌ [STARTUP] Error querying ongoing matches:', queryError.message);
      console.log('🔄 [STARTUP] Trying simpler query without joins...');
      
      try {
        // Fallback: simple query without joins
        const simpleMatches = await pool.query(`
          SELECT 
            id as match_id,
            match_started_at,
            challenger_username,
            opponent_username,
            platform
          FROM ongoing_matches
          WHERE both_redirected = true 
            AND result_checked = false
            AND match_started_at IS NOT NULL
        `);
        
        if (simpleMatches.rows.length === 0) {
          console.log('✅ [STARTUP] No existing matches need result checking (simple query)');
          return;
        }
        
        console.log(`🚀 [STARTUP] Found ${simpleMatches.rows.length} matches that need result checking (simple query)`);
        
        // Use the simple matches data
        for (const match of simpleMatches.rows) {
          const timeSinceStart = Date.now() - new Date(match.match_started_at).getTime();
          const minutesSinceStart = Math.floor(timeSinceStart / (1000 * 60));
          
          console.log(`⚡ [STARTUP] Restarting checker for match ${match.match_id} (${match.challenger_username} vs ${match.opponent_username}, ${minutesSinceStart}min ago)`);
          
          setTimeout(() => {
            PerMatchResultChecker.checkMatchResult(match.match_id, {
              challenger: match.challenger_username,
              opponent: match.opponent_username,
              platform: match.platform
            }, 0);
          }, 1000);
        }
        
        console.log('✅ [STARTUP] All existing match checkers restarted (simple query)');
        return;
        
      } catch (fallbackError) {
        console.error('❌ [STARTUP] Even simple query failed:', fallbackError.message);
        return;
      }
    }
    
    console.log(`🚀 [STARTUP] Found ${existingMatches.rows.length} matches that need result checking`);
    
    for (const match of existingMatches.rows) {
      const timeSinceStart = Date.now() - new Date(match.match_started_at).getTime();
      const minutesSinceStart = Math.floor(timeSinceStart / (1000 * 60));
      
      console.log(`⚡ [STARTUP] Restarting checker for match ${match.match_id} (${match.challenger_username} vs ${match.opponent_username}, ${minutesSinceStart}min ago)`);
      
      // Start checking immediately for matches that have been running
      const matchData = {
        matchId: match.match_id,
        timeControl: match.time_control || '5+0',
        startedAt: match.match_started_at,
        challenger: match.challenger_username,
        opponent: match.opponent_username,
        platform: match.platform
      };
      
      // Start checking immediately since these matches are already running
      setTimeout(() => {
        PerMatchResultChecker.checkMatchResult(match.match_id, {
          challenger: match.challenger_username,
          opponent: match.opponent_username,
          platform: match.platform
        }, 0);
      }, 1000); // Small delay to let server fully start
    }
    
    console.log('✅ [STARTUP] All existing match checkers restarted');
  } catch (error) {
    console.error('❌ [STARTUP] Error initializing existing matches:', error.message);
    if (error.message.includes('relation "ongoing_matches" does not exist')) {
      console.error('💡 [STARTUP] Database tables missing. Please run: npm run db:initialize');
    }
  }
}
