/**
 * Payment queue manager
 * Handles concurrent payment requests and callbacks
 */

import RequestQueue from './RequestQueue.js';
import paymentService from './paymentService.js';
import pool from '../config/database.js';

// Create separate queues for different operations
const paymentQueue = new RequestQueue('PAYMENT_QUEUE', {
  maxConcurrent: 10, // Process 10 payment requests simultaneously
  maxQueueSize: 500,
  retryAttempts: 3,
  retryDelay: 2000,
});

const callbackQueue = new RequestQueue('CALLBACK_QUEUE', {
  maxConcurrent: 15, // Callbacks are critical, process more simultaneously
  maxQueueSize: 1000,
  retryAttempts: 5,
  retryDelay: 1000,
});

const withdrawalQueue = new RequestQueue('WITHDRAWAL_QUEUE', {
  maxConcurrent: 8,
  maxQueueSize: 300,
  retryAttempts: 3,
  retryDelay: 2000,
});

/**
 * Process deposit payment
 */
async function processDeposit(data) {
  const { userId, challengeId, amount, phone, requestId } = data;
  
  console.log(`💳 [PAYMENT_WORKER] Processing deposit: ${requestId}`);
  
  const result = await paymentService.initiateDeposit(
    userId,
    challengeId,
    amount,
    phone
  );
  
  return result;
}

/**
 * Process payment callback
 */
async function processCallback(data) {
  const { callbackData } = data;
  
  console.log(`📞 [CALLBACK_WORKER] Processing callback: ${callbackData.originatorRequestId}`);
  
  // Extract request ID
  let requestId = callbackData.originatorRequestId || 
                  callbackData.message?.split(':')[1]?.trim() ||
                  callbackData.description;
  
  // Strip ONIT prefix if present
  const prefixMatch = requestId?.match(/^\d+\|(.+)$/);
  if (prefixMatch && prefixMatch[1]) {
    requestId = prefixMatch[1];
  }
  
  if (!requestId) {
    throw new Error('No request ID found in callback data');
  }
  
  // Update payment record
  const query = `
    UPDATE payments 
    SET status = $1,
        transaction_reference = $2,
        callback_data = $3,
        updated_at = NOW()
    WHERE request_id = $4
    RETURNING *
  `;
  
  const status = callbackData.statusCode === '0' ? 'completed' : 'failed';
  
  const result = await pool.query(query, [
    status,
    callbackData.transactionReference,
    JSON.stringify(callbackData),
    requestId,
  ]);
  
  if (result.rows.length === 0) {
    throw new Error(`Payment record not found for request ID: ${requestId}`);
  }
  
  console.log(`✅ [CALLBACK_WORKER] Updated payment ${result.rows[0].id}: ${requestId} → ${status}`);
  
  return result.rows[0];
}

/**
 * Process withdrawal
 */
async function processWithdrawal(data) {
  const { userId, challengeId, amount, phone, isRefund } = data;
  
  console.log(`💰 [WITHDRAWAL_WORKER] Processing withdrawal: User ${userId}, Amount ${amount}`);
  
  const result = await paymentService.initiateWithdrawal(
    userId,
    challengeId,
    amount,
    phone,
    isRefund
  );
  
  return result;
}

/**
 * Queue a deposit payment
 */
export async function queueDeposit(userId, challengeId, amount, phone) {
  const requestId = `DEP_${challengeId}_${userId}_${Date.now()}`;
  
  return await paymentQueue.add(
    requestId,
    processDeposit,
    { userId, challengeId, amount, phone, requestId },
    { priority: 2 } // High priority
  );
}

/**
 * Queue a callback
 */
export async function queueCallback(callbackData) {
  const callbackId = `CB_${callbackData.originatorRequestId}_${Date.now()}`;
  
  return await callbackQueue.add(
    callbackId,
    processCallback,
    { callbackData },
    { priority: 3 } // Highest priority
  );
}

/**
 * Queue a withdrawal
 */
export async function queueWithdrawal(userId, challengeId, amount, phone, isRefund = false) {
  const requestId = `WD_${challengeId}_${userId}_${Date.now()}`;
  
  return await withdrawalQueue.add(
    requestId,
    processWithdrawal,
    { userId, challengeId, amount, phone, isRefund, requestId },
    { priority: isRefund ? 3 : 2 } // Higher priority for refunds
  );
}

/**
 * Get all queue statistics
 */
export function getQueueStats() {
  return {
    payments: paymentQueue.getStats(),
    callbacks: callbackQueue.getStats(),
    withdrawals: withdrawalQueue.getStats(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get recent failures across all queues
 */
export function getRecentFailures() {
  return {
    payments: paymentQueue.getRecentFailures(5),
    callbacks: callbackQueue.getRecentFailures(10),
    withdrawals: withdrawalQueue.getRecentFailures(5),
  };
}

// Log queue stats every 30 seconds in production
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    const stats = getQueueStats();
    console.log('📊 [QUEUE_STATS]', JSON.stringify(stats, null, 2));
  }, 30000);
}

console.log('🚀 [PAYMENT_QUEUES] All payment queues initialized');

export default {
  queueDeposit,
  queueCallback,
  queueWithdrawal,
  getQueueStats,
  getRecentFailures,
};
