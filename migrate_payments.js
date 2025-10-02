import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chess_platform',
  password: 'admin',
  port: 5432,
});

async function migratePayments() {
  try {
    console.log('Creating payments table...');

    // Create payments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        challenge_id INTEGER REFERENCES challenges(id),
        game_id VARCHAR(255),
        user_id INTEGER REFERENCES users(id),
        phone_number VARCHAR(20) NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
        request_id VARCHAR(255) UNIQUE NOT NULL,
        transaction_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
        payout_reason VARCHAR(100),
        callback_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Creating indexes...');

    // Create indexes for better performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_challenge_id ON payments(challenge_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_game_id ON payments(game_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_request_id ON payments(request_id);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
    `);

    // Add payment-related columns to challenges table if not exists
    console.log('Adding payment columns to challenges table...');

    const challengeColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='challenges' 
      AND column_name IN ('bet_amount', 'payment_status', 'game_id')
    `);
    
    const existingChallengeColumns = challengeColumns.rows.map(row => row.column_name);
    
    if (!existingChallengeColumns.includes('bet_amount')) {
      await pool.query('ALTER TABLE challenges ADD COLUMN bet_amount DECIMAL(10,2) DEFAULT 0');
    }
    
    if (!existingChallengeColumns.includes('payment_status')) {
      await pool.query(`
        ALTER TABLE challenges ADD COLUMN payment_status VARCHAR(20) DEFAULT 'none' 
        CHECK (payment_status IN ('none', 'pending', 'partial', 'complete'))
      `);
    }

    if (!existingChallengeColumns.includes('game_id')) {
      await pool.query('ALTER TABLE challenges ADD COLUMN game_id VARCHAR(255)');
    }

    // Add phone number columns to users table if not exists (backup for user phone numbers)
    console.log('Checking user table for phone column...');

    const userColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='users' 
      AND column_name = 'phone'
    `);
    
    if (userColumns.rows.length === 0) {
      await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(20)');
    }

    console.log('Payment migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Payment migration failed:', error);
    process.exit(1);
  }
}

migratePayments();