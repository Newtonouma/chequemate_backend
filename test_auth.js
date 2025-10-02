// Quick test script to verify Onit API authentication
import paymentService from './services/paymentService.js';

async function testAuth() {
  console.log('🧪 Testing Onit API authentication...');
  
  try {
    const result = await paymentService.authenticate();
    console.log('✅ Authentication successful!');
    console.log('📋 Response:', result);
    
    // Test a deposit call
    console.log('\n🧪 Testing deposit initiation...');
    const depositResult = await paymentService.initiateDeposit(
      '254759469851', // Test phone number
      10,             // Test amount
      'TEST_' + Date.now()
    );
    console.log('📋 Deposit result:', depositResult);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAuth();