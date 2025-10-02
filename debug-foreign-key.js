import pool from './config/database.js';

async function debugForeignKeyIssue() {
  try {
    console.log('🔍 Debugging foreign key constraint issue...');
    
    // Get the challenge IDs from recent matches (62, 63)
    const matchQuery = await pool.query(`
      SELECT om.id, om.challenge_id, c.id as actual_challenge_id
      FROM ongoing_matches om
      LEFT JOIN challenges c ON om.challenge_id = c.id
      WHERE om.id IN (62, 63)
      ORDER BY om.id
    `);
    
    console.log('\n📊 Match to Challenge mapping:');
    matchQuery.rows.forEach(row => {
      console.log(`Match ${row.id}: references challenge_id ${row.challenge_id} -> ${row.actual_challenge_id ? 'EXISTS' : '❌ MISSING'}`);
    });
    
    // Check all ongoing matches with missing challenges
    const orphanedMatches = await pool.query(`
      SELECT om.id, om.challenge_id, om.created_at
      FROM ongoing_matches om
      LEFT JOIN challenges c ON om.challenge_id = c.id
      WHERE c.id IS NULL
      ORDER BY om.created_at DESC
      LIMIT 10
    `);
    
    console.log(`\n🚨 Found ${orphanedMatches.rows.length} ongoing matches with missing challenges:`);
    orphanedMatches.rows.forEach(row => {
      console.log(`  Match ${row.id}: missing challenge_id ${row.challenge_id} (created: ${row.created_at})`);
    });
    
    // Check recent challenges to see what IDs exist
    const recentChallenges = await pool.query(`
      SELECT id, challenger, opponent, created_at, status
      FROM challenges
      WHERE id > 220
      ORDER BY id DESC
      LIMIT 10
    `);
    
    console.log(`\n✅ Recent challenge IDs that exist:`);
    recentChallenges.rows.forEach(row => {
      console.log(`  Challenge ${row.id}: ${row.status} (created: ${row.created_at})`);
    });
    
    // Check the foreign key constraint
    const constraints = await pool.query(`
      SELECT 
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' 
        AND tc.table_name = 'payments'
        AND kcu.column_name = 'challenge_id'
    `);
    
    console.log(`\n🔗 Foreign key constraint details:`);
    constraints.rows.forEach(row => {
      console.log(`  ${row.constraint_name}: ${row.table_name}.${row.column_name} -> ${row.foreign_table_name}.${row.foreign_column_name}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

debugForeignKeyIssue();