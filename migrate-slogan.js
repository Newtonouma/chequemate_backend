import pool from './config/database.js';

async function addSlogonColumn() {
    try {
        console.log('Adding slogan column if it doesn\'t exist...');
        
        const migrationQuery = `
            DO $$ 
            BEGIN
                -- Check if slogan column exists, if not add it
                IF NOT EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_name = 'users' 
                    AND column_name = 'slogan'
                ) THEN
                    ALTER TABLE users ADD COLUMN slogan VARCHAR(500) DEFAULT 'Ready to Play!';
                    RAISE NOTICE 'Slogan column added successfully';
                ELSE
                    RAISE NOTICE 'Slogan column already exists';
                END IF;
            END $$;
        `;
        
        await pool.query(migrationQuery);
        console.log('Migration completed successfully');
        
    } catch (error) {
        console.error('Migration error:', error);
    } finally {
        await pool.end();
    }
}

addSlogonColumn();
