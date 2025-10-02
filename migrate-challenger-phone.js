import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chess_platform',
  password: 'admin',
  port: 5432,
});

async function migrateChallengerPhone() {
  try {
    console.log('Adding challenger_phone column to challenges table...');

    // Check if challenger_phone column exists
    const challengeColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='challenges' 
      AND column_name = 'challenger_phone'
    `);
    
    if (challengeColumns.rows.length === 0) {
      await pool.query('ALTER TABLE challenges ADD COLUMN challenger_phone VARCHAR(20)');
      console.log('✅ Added challenger_phone column to challenges table');
    } else {
      console.log('✅ challenger_phone column already exists');
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrateChallengerPhone();
