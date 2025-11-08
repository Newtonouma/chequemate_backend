#!/usr/bin/env node

/**
 * PRODUCTION CONNECTION TEST
 * Tests the exact database connection used by the application
 */

import pool from './config/database.js';

async function testConnection() {
  console.log('🔄 [PRODUCTION] Testing application database connection...');
  
  try {
    // Test the connection pool
    const client = await pool.connect();
    console.log('✅ [PRODUCTION] Database connection successful');
    
    // Test basic query
    const result = await client.query('SELECT NOW() as current_time, current_database() as db_name;');
    console.log('📊 [PRODUCTION] Connection test result:', result.rows[0]);
    
    // Test payments table access specifically
    console.log('🔍 [PRODUCTION] Testing payments table access...');
    
    try {
      const paymentsTest = await client.query('SELECT COUNT(*) FROM payments LIMIT 1;');
      console.log(`✅ [PRODUCTION] Payments table accessible, records: ${paymentsTest.rows[0].count}`);
      
      // Test a typical query used by the application
      const appQuery = await client.query(`
        SELECT id, user_id, status, transaction_type 
        FROM payments 
        WHERE status = 'pending' 
        LIMIT 5;
      `);
      console.log(`📋 [PRODUCTION] Sample pending payments: ${appQuery.rows.length} records`);
      
    } catch (paymentsError) {
      console.error('❌ [PRODUCTION] Payments table access failed:', paymentsError.message);
    }
    
    client.release();
    
  } catch (error) {
    console.error('❌ [PRODUCTION] Database connection failed:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail
    });
  }
}

// Test connection
testConnection()
  .then(() => {
    console.log('✅ [PRODUCTION] Connection test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 [PRODUCTION] Connection test failed:', error.message);
    process.exit(1);
  });