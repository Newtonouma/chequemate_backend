import https from 'https';

function testChessAPIRequest(hostname, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: hostname,
      path: path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    };

    console.log(`Testing: https://${hostname}${path}`);

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Headers:`, res.headers);
        
        if (res.statusCode === 200) {
          try {
            const parsed = JSON.parse(data);
            console.log('SUCCESS: User found');
            console.log('Data:', JSON.stringify(parsed, null, 2));
          } catch (e) {
            console.log('SUCCESS: Response received but not JSON');
            console.log('Data:', data);
          }
        } else if (res.statusCode === 404) {
          console.log('NOT FOUND: User does not exist');
        } else {
          console.log('ERROR: Unexpected status code');
          console.log('Data:', data);
        }
        
        resolve({
          statusCode: res.statusCode,
          data: data
        });
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(error);
    });

    req.setTimeout(10000, () => {
      console.log('Request timed out');
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

async function runTests() {
  console.log('=== Testing Chess APIs with native HTTPS ===\n');
  
  try {
    console.log('1. Testing Chess.com API with known user "hikaru"');
    await testChessAPIRequest('api.chess.com', '/pub/player/hikaru');
    
    console.log('\n2. Testing Chess.com stats API for "hikaru"');
    await testChessAPIRequest('api.chess.com', '/pub/player/hikaru/stats');
    
    console.log('\n3. Testing Lichess API with known user "thibault"');
    await testChessAPIRequest('lichess.org', '/api/user/thibault');
    
    console.log('\n4. Testing Chess.com API with invalid user');
    await testChessAPIRequest('api.chess.com', '/pub/player/thisuserdoesnotexist12345');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTests();
