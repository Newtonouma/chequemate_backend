import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';

async function setupDatabase() {
  try {
    console.log('Setting up database tables...');
    
    // Read and execute the SQL file
    const sqlPath = path.join(process.cwd(), 'db', 'createTables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    console.log('✅ Database tables created successfully');
    
    // Test the tables
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('ongoing_matches', 'match_results')
    `);
    
    console.log('Created tables:', tables.rows.map(r => r.table_name));
    
  } catch (error) {
    console.error('Error setting up database:', error);
  }
}

setupDatabase().then(() => {
  console.log('Database setup complete');
  process.exit(0);
}).catch(error => {
  console.error('Setup failed:', error);
  process.exit(1);
});
