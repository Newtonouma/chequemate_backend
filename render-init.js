#!/usr/bin/env node

/**
 * RENDER DEPLOYMENT INITIALIZATION
 * Ensures all required database tables exist on Render
 * This script runs before the main application starts
 */

import pool from './config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeRenderDatabase() {
  console.log('🚀 [RENDER] Initializing database for Render deployment...');
  
  const client = await pool.connect();
  
  try {
    // Check if we're starting with an empty database
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    console.log('📋 [RENDER] Existing tables:', existingTables);
    
    // If no tables exist or payments table is missing, run full schema setup
    if (!existingTables.includes('payments') || !existingTables.includes('users')) {
      console.log('🔧 [RENDER] Setting up base schema...');
      
      // Run base schema
      const schemaPath = path.join(__dirname, 'db/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await client.query(schemaSql);
        console.log('✅ [RENDER] Base schema created');
      }
      
      // Run additional tables
      const createTablesPath = path.join(__dirname, 'db/createTables.sql');
      if (fs.existsSync(createTablesPath)) {
        const createTablesSql = fs.readFileSync(createTablesPath, 'utf8');
        await client.query(createTablesSql);
        console.log('✅ [RENDER] Additional tables created');
      }
    } else {
      console.log('✅ [RENDER] Base tables already exist');
    }
    
    // Verify critical tables exist
    const criticalTables = ['users', 'payments', 'challenges', 'transactions'];
    for (const table of criticalTables) {
      const exists = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        );
      `, [table]);
      
      if (exists.rows[0].exists) {
        console.log(`✅ [RENDER] Table '${table}' confirmed`);
      } else {
        console.error(`❌ [RENDER] Critical table '${table}' missing!`);
        throw new Error(`Missing critical table: ${table}`);
      }
    }
    
    console.log('🎉 [RENDER] Database initialization completed successfully');
    
  } catch (error) {
    console.error('❌ [RENDER] Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export default initializeRenderDatabase;