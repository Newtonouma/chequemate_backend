import pool from './config/database.js';
import fs from 'fs';

async function runMigration() {
  try {
    console.log('Running database migration...');
    
    const sql = fs.readFileSync('./db/add-rating-cache.sql', 'utf8');
    await pool.query(sql);
    
    console.log('Migration completed successfully!');
    console.log('Added columns: current_rating, chess_ratings, last_rating_update, slogan');
    
    pool.end();
  } catch (error) {
    console.error('Migration failed:', error.message);
    pool.end();
    process.exit(1);
  }
}

runMigration();
