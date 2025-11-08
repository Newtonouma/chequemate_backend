#!/usr/bin/env node

/**
 * PRODUCTION DIAGNOSTIC SCRIPT
 * Checks database schema and connection
 */

import pool from './config/database.js';

async function diagnoseProd() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 [PRODUCTION] Checking database connection and schema...');
    
    // Check database connection
    const dbInfo = await client.query('SELECT current_database(), current_user, version();');
    console.log('📊 [PRODUCTION] Database info:', {
      database: dbInfo.rows[0].current_database,
      user: dbInfo.rows[0].current_user,
      version: dbInfo.rows[0].version.split(' ')[0] + ' ' + dbInfo.rows[0].version.split(' ')[1]
    });
    
    // List all tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('📋 [PRODUCTION] Available tables:');
    tables.rows.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });
    
    // Check payments table specifically
    if (tables.rows.find(t => t.table_name === 'payments')) {
      console.log('✅ [PRODUCTION] Payments table exists');
      
      const paymentsCount = await client.query('SELECT COUNT(*) FROM payments;');
      console.log(`📊 [PRODUCTION] Payments table has ${paymentsCount.rows[0].count} records`);
      
      const paymentsStructure = await client.query(`
        SELECT column_name, data_type, is_nullable 
        FROM information_schema.columns 
        WHERE table_name = 'payments' 
        ORDER BY ordinal_position;
      `);
      
      console.log('🏗️  [PRODUCTION] Payments table structure:');
      paymentsStructure.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
      });
      
    } else {
      console.log('❌ [PRODUCTION] Payments table does NOT exist');
    }
    
  } catch (error) {
    console.error('❌ [PRODUCTION] Database error:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run diagnostic
diagnoseProd()
  .then(() => {
    console.log('✅ [PRODUCTION] Diagnostic completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 [PRODUCTION] Diagnostic failed:', error.message);
    process.exit(1);
  });