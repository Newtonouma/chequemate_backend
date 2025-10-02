// Test file to validate chess usernames
import { validateChessUsername } from './controllers/authController.js';

async function testValidation() {
    console.log('Testing Chess.com username validation...');
    
    // Test valid Chess.com username
    const validChessComResult = await validateChessUsername('hikaru', 'chess.com');
    console.log('Valid Chess.com user (hikaru):', validChessComResult);
    
    // Test invalid Chess.com username  
    const invalidChessComResult = await validateChessUsername('nonexistentuser12345', 'chess.com');
    console.log('Invalid Chess.com user:', invalidChessComResult);
    
    console.log('\nTesting Lichess username validation...');
    
    // Test valid Lichess username
    const validLichessResult = await validateChessUsername('thibault', 'lichess.org');
    console.log('Valid Lichess user (thibault):', validLichessResult);
    
    // Test invalid Lichess username
    const invalidLichessResult = await validateChessUsername('nonexistentuser12345', 'lichess.org');
    console.log('Invalid Lichess user:', invalidLichessResult);
}

testValidation().catch(console.error);
