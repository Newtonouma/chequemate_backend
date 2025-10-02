import fetch from 'node-fetch';

const CHESS_COM_API = 'https://api.chess.com/pub';
const LICHESS_API = 'https://lichess.org/api';

async function validateChessUsername(username, platform) {
  console.log(`Testing ${platform} username: ${username}`);
  
  let res, name;
  if (platform === 'chess.com') {
    name = 'Chess.com';
    const url = `${CHESS_COM_API}/player/${username.toLowerCase()}`;
    console.log(`Fetching: ${url}`);
    res = await fetch(url);
  } else if (platform === 'lichess.org') {
    name = 'Lichess.org';
    const url = `${LICHESS_API}/user/${username}`;
    console.log(`Fetching: ${url}`);
    res = await fetch(url);
  } else {
    return { valid: false, error: 'Invalid platform' };
  }

  console.log(`Response status: ${res.status}`);
  console.log(`Response headers:`, res.headers.raw());

  if (res.status === 200) {
    const data = await res.json();
    console.log(`Success! User data:`, data);
    return { valid: true, data };
  }
  if (res.status === 404) {
    return { valid: false, error: `Player "${username}" not found on ${name}` };
  }
  return { valid: false, error: `Error ${res.status} checking "${username}" on ${name}` };
}

async function runTests() {
  console.log('=== Testing Chess Username Validation ===\n');
  
  // Test valid users
  console.log('1. Testing valid Chess.com user...');
  let result = await validateChessUsername('hikaru', 'chess.com');
  console.log('Result:', result);
  
  console.log('\n2. Testing valid Lichess user...');
  result = await validateChessUsername('thibault', 'lichess.org');
  console.log('Result:', result);
  
  console.log('\n3. Testing invalid Chess.com user...');
  result = await validateChessUsername('thisuserdoesnotexist12345', 'chess.com');
  console.log('Result:', result);
  
  console.log('\n4. Testing invalid Lichess user...');
  result = await validateChessUsername('thisuserdoesnotexist12345', 'lichess.org');
  console.log('Result:', result);
}

runTests().catch(console.error);
