import pool from './config/database.js';

async function diagnoseAndFix() {
  try {
    console.log('🔍 Diagnosing database issues...\n');
    
    // Test basic connection
    console.log('1. Testing database connection...');
    const timeResult = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connection successful!');
    console.log('   Current time:', timeResult.rows[0].current_time);
    
    // Check users table structure
    console.log('\n2. Checking users table structure...');
    const userTableInfo = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('   Users table columns:');
    userTableInfo.rows.forEach(row => {
      console.log(`   - ${row.column_name}: ${row.data_type} (default: ${row.column_default}, nullable: ${row.is_nullable})`);
    });
    
    // Check if slogan column exists
    const sloganExists = userTableInfo.rows.some(row => row.column_name === 'slogan');
    
    if (sloganExists) {
      console.log('\n⚠️  ISSUE FOUND: slogan column exists but code was reverted!');
      console.log('   This mismatch is likely causing the login/registration failures.');
      
      // Option 1: Remove slogan column to match reverted code
      console.log('\n🔧 Fixing by removing slogan column...');
      await pool.query('ALTER TABLE users DROP COLUMN IF EXISTS slogan CASCADE');
      console.log('✅ Removed slogan column');
      
    } else {
      console.log('\n✅ Schema matches reverted code (no slogan column)');
    }
    
    // Test a simple user query
    console.log('\n3. Testing user queries...');
    const userCount = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`   Total users: ${userCount.rows[0].count}`);
    
    if (userCount.rows[0].count > 0) {
      const sampleUser = await pool.query('SELECT username, email FROM users LIMIT 1');
      console.log(`   Sample user: ${sampleUser.rows[0].username} (${sampleUser.rows[0].email})`);
    }
    
    console.log('\n✅ Database diagnosis and fix complete!');
    console.log('   You should now be able to login/register successfully.');
    
  } catch (error) {
    console.error('\n❌ Error during diagnosis:', error);
    
    if (error.code === 'ETIMEDOUT') {
      console.log('\n🔥 AIVEN CONNECTION TIMEOUT DETECTED!');
      console.log('   Possible solutions:');
      console.log('   1. Check if your Aiven service is running in the console');
      console.log('   2. Verify your internet connection');
      console.log('   3. Try connecting from Aiven console directly');
      console.log('   4. Check if service was suspended due to inactivity');
    }
    
  } finally {
    await pool.end();
  }
}

diagnoseAndFix();
