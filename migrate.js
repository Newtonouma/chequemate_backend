import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'chess_platform',
  password: 'admin',
  port: 5432,
});

async function migrate() {
  try {
    // Check if columns exist
    const checkColumns = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='challenges' 
      AND column_name IN ('time_control', 'rules', 'updated_at')
    `);
    
    const existingColumns = checkColumns.rows.map(row => row.column_name);
    
    if (!existingColumns.includes('time_control')) {
      console.log('Adding time_control column...');
      await pool.query('ALTER TABLE challenges ADD COLUMN time_control VARCHAR(255) DEFAULT \'10+0\'');
    }
    
    if (!existingColumns.includes('rules')) {
      console.log('Adding rules column...');
      await pool.query('ALTER TABLE challenges ADD COLUMN rules VARCHAR(255) DEFAULT \'chess\'');
    }
    
    if (!existingColumns.includes('updated_at')) {
      console.log('Adding updated_at column...');
      await pool.query('ALTER TABLE challenges ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP');
    }
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
