import axios from 'axios';

// Hard-coded test data
const testData = {
    phoneNumber: '254759469851',
    amount: 10,
    challengeId: 205,
    userId: 3
};

console.log('🧪 [TEST] Starting deposit test with data:', testData);

// Step 1: Generate request ID
const generateRequestId = (challengeId, userId) => {
    console.log('🆔 [TEST] Generating request ID with challengeId:', challengeId, 'userId:', userId);
    console.log('🆔 [TEST] Type of challengeId:', typeof challengeId);
    console.log('🆔 [TEST] Type of userId:', typeof userId);
    
    const timestamp = Date.now();
    const requestId = `DEP_${challengeId}_${userId}_${timestamp}`;
    
    console.log('🆔 [TEST] Generated request ID:', requestId);
    return requestId;
};

// Step 2: Test amount conversion
const testAmountConversion = (amount) => {
    console.log('💵 [TEST] Testing amount conversion with:', amount, 'type:', typeof amount);
    
    const numericAmount = Number(amount);
    console.log('💵 [TEST] Converted to number:', numericAmount, 'type:', typeof numericAmount);
    console.log('💵 [TEST] Is NaN?', isNaN(numericAmount));
    
    const stringAmount = numericAmount.toFixed(2);
    console.log('💵 [TEST] String format:', stringAmount);
    
    return { numericAmount, stringAmount };
};

// Step 3: Test payment data structure
const createPaymentData = (userId, challengeId, phoneNumber, amount, requestId) => {
    console.log('📝 [TEST] Creating payment data with:');
    console.log('  userId:', userId, 'type:', typeof userId);
    console.log('  challengeId:', challengeId, 'type:', typeof challengeId);
    console.log('  phoneNumber:', phoneNumber, 'type:', typeof phoneNumber);
    console.log('  amount:', amount, 'type:', typeof amount);
    console.log('  requestId:', requestId, 'type:', typeof requestId);
    
    const paymentData = {
        user_id: Number(userId),
        challenge_id: Number(challengeId),
        phone_number: phoneNumber,
        amount: Number(amount),
        transaction_type: 'deposit',
        status: 'pending',
        request_id: requestId
    };
    
    console.log('📝 [TEST] Created payment data:', paymentData);
    console.log('📝 [TEST] user_id type:', typeof paymentData.user_id, 'isNaN:', isNaN(paymentData.user_id));
    console.log('📝 [TEST] challenge_id type:', typeof paymentData.challenge_id, 'isNaN:', isNaN(paymentData.challenge_id));
    console.log('📝 [TEST] amount type:', typeof paymentData.amount, 'isNaN:', isNaN(paymentData.amount));
    
    return paymentData;
};

// Step 4: Test API call structure
const createApiCallData = (phoneNumber, amount, requestId) => {
    const { stringAmount } = testAmountConversion(amount);
    
    const apiData = {
        sourceAccount: phoneNumber,
        amount: stringAmount,
        requestId: requestId,
        destinationAccount: '0001650000002'
    };
    
    console.log('🌐 [TEST] API call data:', apiData);
    return apiData;
};

// Main test function
async function runDepositTest() {
    try {
        console.log('🚀 [TEST] =================== STARTING DEPOSIT TEST ===================');
        
        // Test data extraction
        const { phoneNumber, amount, challengeId, userId } = testData;
        console.log('📊 [TEST] Extracted data:', { phoneNumber, amount, challengeId, userId });
        
        // Test request ID generation
        const requestId = generateRequestId(challengeId, userId);
        
        // Test amount conversion
        const amountTest = testAmountConversion(amount);
        
        // Test payment data creation
        const paymentData = createPaymentData(userId, challengeId, phoneNumber, amount, requestId);
        
        // Test API call data
        const apiCallData = createApiCallData(phoneNumber, amount, requestId);
        
        console.log('✅ [TEST] All data structures created successfully');
        console.log('✅ [TEST] No NaN values detected in final structures');
        
        // Simulate the exact flow from paymentService
        console.log('🔄 [TEST] =================== SIMULATING EXACT FLOW ===================');
        
        const simulatedFlow = {
            phoneNumber: phoneNumber,
            amount: amountTest.stringAmount,
            challengeId: challengeId,
            userId: userId,
            timestamp: new Date().toISOString()
        };
        
        console.log('🏦 [SIMULATED] Starting deposit initiation:', simulatedFlow);
        
        const simRequestId = `DEP_${challengeId}_${userId}_${Date.now()}`;
        console.log('🆔 [SIMULATED] Generated request ID:', simRequestId);
        
        const simApiData = {
            sourceAccount: phoneNumber,
            amount: amountTest.stringAmount,
            requestId: simRequestId,
            destinationAccount: '0001650000002'
        };
        
        console.log('📞 [SIMULATED] Calling payment service with:', simApiData);
        console.log('💰 [SIMULATED] Initiating deposit of KSH', amountTest.stringAmount, 'from', phoneNumber);
        
        const simPaymentData = {
            user_id: Number(userId),
            challenge_id: Number(challengeId),
            phone_number: phoneNumber,
            amount: Number(amount),
            transaction_type: 'deposit',
            status: 'pending',
            request_id: simRequestId
        };
        
        console.log('💾 [SIMULATED] Payment data to insert:', simPaymentData);
        
        // Check for any NaN values
        const hasNaN = Object.values(simPaymentData).some(value => 
            typeof value === 'number' && isNaN(value)
        );
        
        if (hasNaN) {
            console.log('❌ [SIMULATED] ERROR: NaN detected in payment data!');
            Object.entries(simPaymentData).forEach(([key, value]) => {
                if (typeof value === 'number' && isNaN(value)) {
                    console.log(`❌ [SIMULATED] NaN found in ${key}: ${value}`);
                }
            });
        } else {
            console.log('✅ [SIMULATED] No NaN values in payment data');
        }
        
    } catch (error) {
        console.error('❌ [TEST] Error during test:', error);
    }
}

// Run the test
runDepositTest();
