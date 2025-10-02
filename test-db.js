import pool from './config/database.js';

async function test() {
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', result.rows[0]);
    
    // Check table structure
    const tableInfo = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'challenges'
      ORDER BY ordinal_position
    `);
    
    console.log('Challenges table structure:');
    tableInfo.rows.forEach(row => {
      console.log(`- ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

test();
