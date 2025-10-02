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

async function updatePaymentConstraints() {
  try {
    console.log('🔧 Updating payment transaction type constraints...');
    
    // Drop old constraint
    console.log('1. Dropping old transaction_type constraint...');
    await pool.query('ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_transaction_type_check;');
    
    // Add new constraint with balance_credit
    console.log('2. Adding new constraint with balance_credit...');
    await pool.query(`
      ALTER TABLE payments ADD CONSTRAINT payments_transaction_type_check 
      CHECK (transaction_type IN ('deposit', 'withdrawal', 'payout', 'refund', 'balance_credit'))
    `);
    
    // Add notes column if it doesn't exist
    console.log('3. Adding notes column if missing...');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;');
    
    // Verify the changes
    console.log('4. Verifying constraint changes...');
    const constraints = await pool.query(`
      SELECT 
          tc.constraint_name, 
          cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc 
          ON tc.constraint_name = cc.constraint_name
      WHERE tc.table_name = 'payments' 
          AND tc.constraint_type = 'CHECK'
          AND cc.check_clause LIKE '%transaction_type%'
    `);
    
    console.log('✅ Updated constraint:');
    constraints.rows.forEach(row => {
      console.log(`   - ${row.constraint_name}: ${row.check_clause}`);
    });
    
    console.log('🎉 Payment constraints updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating constraints:', error.message);
    process.exit(1);
  }
}

updatePaymentConstraints();