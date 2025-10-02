import pool from './config/database.js';

async function migrate() {
  console.log('Starting migration...');
  
  try {
    // Add time_control column
    await pool.query(`
      ALTER TABLE challenges 
      ADD COLUMN IF NOT EXISTS time_control VARCHAR(255) DEFAULT '10+0'
    `);
    console.log('✓ Added time_control column');
    
    // Add rules column
    await pool.query(`
      ALTER TABLE challenges 
      ADD COLUMN IF NOT EXISTS rules VARCHAR(255) DEFAULT 'chess'
    `);
    console.log('✓ Added rules column');
    
    // Add updated_at column
    await pool.query(`
      ALTER TABLE challenges 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✓ Added updated_at column');
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
