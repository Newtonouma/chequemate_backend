import pool from '../config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createPaymentsTable() {
  try {
    console.log('🚀 Creating payments table...');
    
    const sqlPath = path.join(__dirname, '../db/create_payments_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await pool.query(sql);
    console.log('✅ Payments table created successfully');
    
    // Test the table exists
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'payments' 
      ORDER BY ordinal_position;
    `);
    
    console.log('📋 Payments table structure:');
    result.rows.forEach(col => {
      console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating payments table:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createPaymentsTable();