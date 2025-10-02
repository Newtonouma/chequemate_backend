#!/usr/bin/env node

// Database initialization script for production deployment
// This script ensures all required tables exist before starting the server

import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const initializeDatabase = async () => {
  console.log('🔄 Initializing database schema...');
  
  try {
    // Test database connection first
    const client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Read the simple initialization SQL (avoids foreign key constraint issues)
    const sqlPath = path.resolve(__dirname, 'simple-init.sql');
    const schemaSql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📄 Executing database schema creation...');
    
    // Execute the schema creation
    await client.query(schemaSql);
    
    console.log('✅ Database schema initialized successfully');
    console.log('📊 All required tables are now available:');
    console.log('   - users (user accounts)');
    console.log('   - challenges (game challenges)');
    console.log('   - games (completed games)');
    console.log('   - ongoing_matches (active match tracking)');
    console.log('   - match_results (match outcomes)');
    console.log('   - payment_deposits (payment deposits)');
    console.log('   - payment_payouts (payment payouts)');
    console.log('   - postponed_challenges (postponed games)');
    
    // Verify critical tables exist
    const tablesCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'challenges', 'ongoing_matches', 'match_results')
      ORDER BY table_name
    `);
    
    const existingTables = tablesCheck.rows.map(row => row.table_name);
    console.log('🔍 Verified tables exist:', existingTables.join(', '));
    
    if (existingTables.includes('ongoing_matches')) {
      console.log('✅ ongoing_matches table verified - match tracking will work');
    } else {
      console.error('❌ ongoing_matches table missing - this will cause startup errors');
    }
    
    client.release();
    console.log('🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

// Run initialization if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialization script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}

export default initializeDatabase;