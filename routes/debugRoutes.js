import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

// Get payment status for debugging
router.get('/payments/:challengeId/status', async (req, res) => {
  try {
    const { challengeId } = req.params;
    
    console.log(`🔍 [PAYMENT_DEBUG] Checking payment status for challenge ${challengeId}`);
    
    const query = `
      SELECT 
        id,
        user_id,
        challenge_id,
        phone_number,
        amount,
        transaction_type,
        status,
        request_id,
        transaction_id,
        created_at,
        updated_at,
        callback_data
      FROM payments 
      WHERE challenge_id = $1
      ORDER BY created_at DESC;
    `;
    
    const result = await pool.query(query, [challengeId]);
    
    const payments = result.rows;
    const summary = {
      totalPayments: payments.length,
      completedDeposits: payments.filter(p => p.transaction_type === 'deposit' && p.status === 'completed').length,
      pendingDeposits: payments.filter(p => p.transaction_type === 'deposit' && p.status === 'pending').length,
      failedDeposits: payments.filter(p => p.transaction_type === 'deposit' && p.status === 'failed').length
    };
    
    console.log(`📊 [PAYMENT_DEBUG] Payment summary for challenge ${challengeId}:`, summary);
    
    res.json({
      success: true,
      challengeId: parseInt(challengeId),
      summary,
      payments: payments.map(p => ({
        ...p,
        callback_data: p.callback_data ? 'present' : 'null' // Don't expose full callback data
      }))
    });
    
  } catch (error) {
    console.error('❌ [PAYMENT_DEBUG] Error fetching payment status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment status',
      error: error.message
    });
  }
});

// Get specific payment by request ID
router.get('/payments/request/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    
    console.log(`🔍 [PAYMENT_DEBUG] Checking payment with request ID ${requestId}`);
    
    const query = `
      SELECT 
        id,
        user_id,
        challenge_id,
        phone_number,
        amount,
        transaction_type,
        status,
        request_id,
        transaction_id,
        created_at,
        updated_at,
        callback_data
      FROM payments 
      WHERE request_id = $1;
    `;
    
    const result = await pool.query(query, [requestId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    const payment = result.rows[0];
    
    res.json({
      success: true,
      payment: {
        ...payment,
        callback_data: payment.callback_data || null
      }
    });
    
  } catch (error) {
    console.error('❌ [PAYMENT_DEBUG] Error fetching payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment',
      error: error.message
    });
  }
});

// Force payment completion (for testing/emergency use)
router.post('/payments/:paymentId/force-complete', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { reason } = req.body;
    
    console.log(`🚨 [PAYMENT_DEBUG] Force completing payment ${paymentId}, reason: ${reason || 'manual override'}`);
    
    const updateQuery = `
      UPDATE payments 
      SET 
        status = 'completed',
        transaction_id = COALESCE(transaction_id, 'MANUAL_' || EXTRACT(EPOCH FROM NOW())),
        updated_at = NOW(),
        callback_data = COALESCE(callback_data, '{"manual_completion": true, "reason": "' || $2 || '", "timestamp": "' || NOW() || '"}')
      WHERE id = $1
      RETURNING *;
    `;
    
    const result = await pool.query(updateQuery, [paymentId, reason || 'manual override']);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }
    
    const payment = result.rows[0];
    
    // Manually trigger the same logic as callback handler
    const io = req.app.get('socketio');
    
    if (payment.transaction_type === 'deposit' && payment.user_id) {
      console.log(`📡 [PAYMENT_DEBUG] Emitting payment-success to user ${payment.user_id}`);
      
      if (io) {
        io.to(payment.user_id.toString()).emit('payment-success', {
          userId: payment.user_id,
          challengeId: payment.challenge_id,
          amount: payment.amount,
          message: 'Payment manually completed!',
          timestamp: new Date().toISOString(),
        });
      }
      
      // Check if both deposits are now complete
      const depositQuery = `
        SELECT COUNT(*) as deposit_count
        FROM payments 
        WHERE challenge_id = $1 
        AND transaction_type = 'deposit' 
        AND status = 'completed';
      `;
      
      const depositResult = await pool.query(depositQuery, [payment.challenge_id]);
      const depositCount = parseInt(depositResult.rows[0].deposit_count);
      
      if (depositCount >= 2) {
        console.log(`🎉 [PAYMENT_DEBUG] Both deposits complete for challenge ${payment.challenge_id}`);
        
        // Update challenge status
        await pool.query(
          "UPDATE challenges SET status = 'deposits_complete' WHERE id = $1",
          [payment.challenge_id]
        );
        
        // Get challenge details and emit both-payments-completed
        const challengeQuery = `
          SELECT c.id, c.challenger, c.opponent, c.platform, c.bet_amount,
                 cu.username as challenger_username,
                 ou.username as opponent_username
          FROM challenges c
          JOIN users cu ON c.challenger = cu.id
          JOIN users ou ON c.opponent = ou.id
          WHERE c.id = $1;
        `;
        
        const challengeResult = await pool.query(challengeQuery, [payment.challenge_id]);
        
        if (challengeResult.rows.length > 0 && io) {
          const challengeData = challengeResult.rows[0];
          
          const notificationData = {
            challengeId: challengeData.id,
            challengerId: challengeData.challenger,
            opponentId: challengeData.opponent,
            platform: challengeData.platform,
            betAmount: challengeData.bet_amount,
            challengerUsername: challengeData.challenger_username,
            opponentUsername: challengeData.opponent_username,
            message: "Both players have paid! Ready to start the match.",
            timestamp: new Date().toISOString(),
          };
          
          io.to(challengeData.challenger.toString()).emit('both-payments-completed', notificationData);
          io.to(challengeData.opponent.toString()).emit('both-payments-completed', notificationData);
          
          console.log(`📡 [PAYMENT_DEBUG] Emitted both-payments-completed to both players`);
        }
      }
    }
    
    res.json({
      success: true,
      message: 'Payment manually completed',
      payment: payment
    });
    
  } catch (error) {
    console.error('❌ [PAYMENT_DEBUG] Error force completing payment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to force complete payment',
      error: error.message
    });
  }
});

// Database table structure diagnostic
router.get('/database/table-structure', async (req, res) => {
  try {
    console.log('🔍 [DEBUG] Checking database table structure');
    
    // Check if payments table exists and get its structure
    const tableQuery = `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'payments'
      ORDER BY ordinal_position;
    `;
    
    const result = await pool.query(tableQuery);
    
    // Also check if the table exists at all
    const tableExistsQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'payments'
      );
    `;
    
    const existsResult = await pool.query(tableExistsQuery);
    
    // Try a direct column check
    const columnCheckQuery = `
      SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'payments' 
        AND column_name = 'transaction_id'
      );
    `;
    
    const columnExists = await pool.query(columnCheckQuery);
    
    res.json({
      success: true,
      tableExists: existsResult.rows[0].exists,
      hasTransactionIdColumn: columnExists.rows[0].exists,
      columns: result.rows,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [DEBUG] Error checking table structure:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Manual column addition endpoint (for production hotfixes)
router.post('/database/add-missing-columns', async (req, res) => {
  try {
    console.log('🔧 [DEBUG] Manual column addition requested');
    
    const results = {
      notes_column: { attempted: false, success: false, error: null },
      transaction_id_column: { attempted: false, success: false, error: null },
      match_result_column: { attempted: false, success: false, error: null },
      balance_column: { attempted: false, success: false, error: null }
    };

    // Try to add notes column to payments table
    try {
      results.notes_column.attempted = true;
      await pool.query('ALTER TABLE payments ADD COLUMN notes TEXT');
      results.notes_column.success = true;
      console.log('✅ [DEBUG] Successfully added notes column to payments table');
    } catch (error) {
      results.notes_column.error = error.message;
      if (error.code === '42701') {
        results.notes_column.success = true; // Column already exists
        console.log('ℹ️ [DEBUG] Notes column already exists in payments table');
      } else {
        console.error('❌ [DEBUG] Error adding notes column:', error.message);
      }
    }

    // Try to add transaction_id column to payments table
    try {
      results.transaction_id_column.attempted = true;
      await pool.query('ALTER TABLE payments ADD COLUMN transaction_id VARCHAR(255)');
      results.transaction_id_column.success = true;
      console.log('✅ [DEBUG] Successfully added transaction_id column to payments table');
    } catch (error) {
      results.transaction_id_column.error = error.message;
      if (error.code === '42701') {
        results.transaction_id_column.success = true; // Column already exists
        console.log('ℹ️ [DEBUG] Transaction_id column already exists in payments table');
      } else {
        console.error('❌ [DEBUG] Error adding transaction_id column:', error.message);
      }
    }

    // Try to add match_result column to ongoing_matches table
    try {
      results.match_result_column.attempted = true;
      await pool.query('ALTER TABLE ongoing_matches ADD COLUMN match_result VARCHAR(50)');
      results.match_result_column.success = true;
      console.log('✅ [DEBUG] Successfully added match_result column to ongoing_matches table');
    } catch (error) {
      results.match_result_column.error = error.message;
      if (error.code === '42701') {
        results.match_result_column.success = true; // Column already exists
        console.log('ℹ️ [DEBUG] Match_result column already exists in ongoing_matches table');
      } else {
        console.error('❌ [DEBUG] Error adding match_result column:', error.message);
      }
    }

    // Try to add balance column to users table
    try {
      results.balance_column.attempted = true;
      await pool.query('ALTER TABLE users ADD COLUMN balance DECIMAL(10, 2) DEFAULT 0.00');
      results.balance_column.success = true;
      console.log('✅ [DEBUG] Successfully added balance column to users table');
    } catch (error) {
      results.balance_column.error = error.message;
      if (error.code === '42701') {
        results.balance_column.success = true; // Column already exists
        console.log('ℹ️ [DEBUG] Balance column already exists in users table');
      } else {
        console.error('❌ [DEBUG] Error adding balance column:', error.message);
      }
    }

    // Try to add indexes
    try {
      await pool.query('CREATE INDEX IF NOT EXISTS idx_payments_notes ON payments(notes)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_payments_transaction_id ON payments(transaction_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_ongoing_matches_match_result ON ongoing_matches(match_result)');
      console.log('✅ [DEBUG] Successfully created/verified indexes');
    } catch (error) {
      console.warn('⚠️ [DEBUG] Index creation warning (non-critical):', error.message);
    }

    res.json({
      success: true,
      message: 'Column addition attempts completed',
      results,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [DEBUG] Error in manual column addition:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Manual migration trigger (for production hotfixes)
router.post('/migrations/run', async (req, res) => {
  try {
    console.log('🔄 [DEBUG] Manual migration trigger requested');
    
    // Import migration runner
    const migrationRunnerModule = await import('../utils/migrationRunner.js');
    const migrationRunner = migrationRunnerModule.default;
    
    // Get current status
    const statusBefore = await migrationRunner.getStatus();
    console.log('📊 [DEBUG] Migration status before:', statusBefore);
    
    // Run migrations
    await migrationRunner.runAll();
    
    // Get status after
    const statusAfter = await migrationRunner.getStatus();
    console.log('📊 [DEBUG] Migration status after:', statusAfter);
    
    res.json({
      success: true,
      message: 'Migrations executed successfully',
      before: statusBefore,
      after: statusAfter,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [DEBUG] Error running migrations:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;