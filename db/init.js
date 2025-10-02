import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const initDb = async () => {
  try {
    const client = await pool.connect();
    
    // Use the complete initialization script that includes all tables
    const schemaSql = fs.readFileSync(path.resolve(__dirname, 'complete-init.sql')).toString();
    await client.query(schemaSql);
    
    console.log('✅ Complete database schema initialized successfully.');
    console.log('📊 Tables created: users, challenges, games, postponed_challenges, ongoing_matches, match_results, payment_deposits, payment_payouts');
    
    client.release();
  } catch (err) {
    console.error('❌ Error initializing database schema:', err);
    console.error('This may cause issues with match tracking and payment processing.');
  }
};

initDb();
