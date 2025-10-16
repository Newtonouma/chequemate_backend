/**
 * Run the transaction types migration
 * This adds 'balance_credit' and 'refund' to allowed payment transaction types
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    console.log('🔧 [MIGRATION] Starting transaction types migration...');

    // Read the migration SQL file
    const migrationPath = path.join(__dirname, 'db', 'add_transaction_types_migration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute the migration
    await pool.query(sql);

    console.log('✅ [MIGRATION] Transaction types migration completed successfully');
    console.log('   Added transaction types: balance_credit, refund');
    
    // Verify the constraint
    const result = await pool.query(`
      SELECT 
        conname AS constraint_name,
        pg_get_constraintdef(oid) AS constraint_definition
      FROM pg_constraint
      WHERE conname = 'payments_transaction_type_check'
    `);

    if (result.rows.length > 0) {
      console.log('\n📋 [MIGRATION] Current constraint definition:');
      console.log(result.rows[0].constraint_definition);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ [MIGRATION] Error running migration:', error);
    process.exit(1);
  }
}

runMigration();
