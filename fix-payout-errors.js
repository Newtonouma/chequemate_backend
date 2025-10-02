import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    database: "chequemate",
    user: "avnadmin",
    password: "AVNS_KY97oCF7I1z8WXQ6_gm",
    host: "chequemate-service-chequemate-db.g.aivencloud.com",
    port: 20381,
    ssl: {
        rejectUnauthorized: false,
    }
});

async function fixConstraints() {
  try {
    console.log('🔧 Fixing database constraints and schema...');
    
    // Fix 1: Update payments table constraint
    console.log('1. Dropping old transaction_type constraint...');
    await pool.query('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_transaction_type_check;');
    
    console.log('2. Adding new constraint with payout and refund...');
    await pool.query(`
      ALTER TABLE payments ADD CONSTRAINT payments_transaction_type_check 
      CHECK (transaction_type IN ('deposit', 'withdrawal', 'payout', 'refund'))
    `);
    
    // Fix 2: Add missing columns to ongoing_matches
    console.log('3. Adding match_result column to ongoing_matches...');
    await pool.query('ALTER TABLE ongoing_matches ADD COLUMN IF NOT EXISTS match_result JSONB;');
    
    console.log('4. Adding completed_at column to ongoing_matches...');
    await pool.query('ALTER TABLE ongoing_matches ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;');
    
    // Verify the changes
    console.log('5. Verifying constraint changes...');
    const constraints = await pool.query(`
      SELECT 
          tc.constraint_name, 
          tc.table_name, 
          cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc 
          ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'payments' 
          AND tc.constraint_type = 'CHECK'
    `);
    
    console.log('✅ Constraints updated:');
    constraints.rows.forEach(row => {
      console.log(`   - ${row.constraint_name}: ${row.check_clause}`);
    });
    
    console.log('6. Verifying ongoing_matches columns...');
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'ongoing_matches' 
      AND column_name IN ('match_result', 'completed_at')
      ORDER BY column_name
    `);
    
    console.log('✅ ongoing_matches columns:');
    columns.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('🎉 All fixes applied successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error applying fixes:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

fixConstraints();