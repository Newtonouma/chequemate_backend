#!/usr/bin/env node

/**
 * PRODUCTION MIGRATION SCRIPT
 * Creates the missing payments table safely
 * Only runs if table doesn't exist
 */

import pool from './config/database.js';

async function createPaymentsTable() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 [PRODUCTION] Checking if payments table exists...');
    
    // Check if payments table already exists
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'payments'
      );
    `);
    
    if (tableExists.rows[0].exists) {
      console.log('✅ [PRODUCTION] Payments table already exists. No action needed.');
      return;
    }
    
    console.log('🚀 [PRODUCTION] Creating payments table...');
    
    // Create payments table with all required columns and constraints
    await client.query(`
      CREATE TABLE payments (
        id                     SERIAL PRIMARY KEY,
        user_id                INTEGER NOT NULL
          REFERENCES users ( id )
             ON DELETE CASCADE,
        challenge_id           INTEGER,
        phone_number           VARCHAR(20) NOT NULL,
        amount                 DECIMAL(10,2) NOT NULL,
        transaction_type       VARCHAR(20) NOT NULL CHECK ( transaction_type IN ( 'deposit',
                                                                                  'withdrawal',
                                                                                  'refund' ) ),
        status                 VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ( status IN ( 'pending',
                                                                                          'completed',
                                                                                          'failed',
                                                                                          'cancelled' ) ),
        request_id             VARCHAR(255) UNIQUE NOT NULL,
        game_id                INTEGER,
        payout_reason          VARCHAR(255),
        transaction_reference  VARCHAR(255),
        callback_data          JSONB,
        opponent_id            INTEGER
          REFERENCES users ( id )
             ON DELETE SET NULL,
        created_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    console.log('📊 [PRODUCTION] Creating indexes for performance...');
    
    // Create performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_challenge_id ON payments(challenge_id);
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
      CREATE INDEX IF NOT EXISTS idx_payments_transaction_type ON payments(transaction_type);
      CREATE INDEX IF NOT EXISTS idx_payments_request_id ON payments(request_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user_status ON payments(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_payments_opponent_id ON payments(opponent_id);
      CREATE INDEX IF NOT EXISTS idx_payments_callback_data ON payments USING GIN (callback_data);
    `);
    
    console.log('🔧 [PRODUCTION] Creating update trigger...');
    
    // Create update timestamp trigger
    await client.query(`
      CREATE OR REPLACE FUNCTION update_payments_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ language 'plpgsql';
      
      CREATE TRIGGER update_payments_updated_at_trigger
          BEFORE UPDATE ON payments
          FOR EACH ROW
          EXECUTE FUNCTION update_payments_updated_at();
    `);
    
    console.log('✅ [PRODUCTION] Payments table created successfully!');
    
    // Verify table structure
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 [PRODUCTION] Payments table structure:');
    columns.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });
    
  } catch (error) {
    console.error('❌ [PRODUCTION] Error creating payments table:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration
createPaymentsTable()
  .then(() => {
    console.log('🎉 [PRODUCTION] Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 [PRODUCTION] Migration failed:', error.message);
    process.exit(1);
  });