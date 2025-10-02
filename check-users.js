import pool from './config/database.js';

async function checkExistingUsers() {
    try {
        console.log('Checking existing users...');
        
        // Check for username "sirbohrs"
        const usernameQuery = 'SELECT id, username, email, preferred_platform FROM users WHERE username = $1';
        const usernameResult = await pool.query(usernameQuery, ['sirbohrs']);
        
        if (usernameResult.rows.length > 0) {
            console.log('Found existing user with username "sirbohrs":');
            console.log(usernameResult.rows[0]);
        } else {
            console.log('No user found with username "sirbohrs"');
        }
        
        // Check for email "sirbohrs@test.com"
        const emailQuery = 'SELECT id, username, email, preferred_platform FROM users WHERE email = $1';
        const emailResult = await pool.query(emailQuery, ['sirbohrs@test.com']);
        
        if (emailResult.rows.length > 0) {
            console.log('Found existing user with email "sirbohrs@test.com":');
            console.log(emailResult.rows[0]);
        } else {
            console.log('No user found with email "sirbohrs@test.com"');
        }
        
        // List all users
        const allUsersQuery = 'SELECT id, username, email, preferred_platform FROM users ORDER BY created_at DESC LIMIT 10';
        const allUsersResult = await pool.query(allUsersQuery);
        
        console.log('\nRecent users in database:');
        console.log(allUsersResult.rows);
        
    } catch (error) {
        console.error('Error checking users:', error);
    } finally {
        await pool.end();
    }
}

checkExistingUsers();
