/**
 * Queue monitoring controller
 * Provides endpoints for monitoring queue health and stats
 */

import paymentQueueManager from '../services/paymentQueueManager.js';

class QueueMonitorController {
  /**
   * Get current queue statistics
   */
  async getQueueStats(req, res) {
    try {
      const stats = paymentQueueManager.getQueueStats();
      
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('❌ [QUEUE_MONITOR] Error getting queue stats:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get queue statistics',
        message: error.message,
      });
    }
  }

  /**
   * Get recent queue failures
   */
  async getRecentFailures(req, res) {
    try {
      const failures = paymentQueueManager.getRecentFailures();
      
      res.json({
        success: true,
        data: failures,
      });
    } catch (error) {
      console.error('❌ [QUEUE_MONITOR] Error getting failures:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get recent failures',
        message: error.message,
      });
    }
  }

  /**
   * Health check endpoint - returns 503 if queues are unhealthy
   */
  async healthCheck(req, res) {
    try {
      const stats = paymentQueueManager.getQueueStats();
      
      // Define health thresholds
      const MAX_QUEUE_SIZE = 800; // 80% of max
      const MAX_FAILURE_RATE = 0.1; // 10%
      
      const issues = [];
      
      // Check each queue
      for (const [queueName, queueStats] of Object.entries(stats)) {
        if (queueName === 'timestamp') continue;
        
        // Check queue size
        if (queueStats.queue.size > MAX_QUEUE_SIZE) {
          issues.push(`${queueName}: Queue size (${queueStats.queue.size}) exceeds threshold (${MAX_QUEUE_SIZE})`);
        }
        
        // Check failure rate
        const totalProcessed = queueStats.stats.processed + queueStats.stats.failed;
        if (totalProcessed > 0) {
          const failureRate = queueStats.stats.failed / totalProcessed;
          if (failureRate > MAX_FAILURE_RATE) {
            issues.push(`${queueName}: Failure rate (${(failureRate * 100).toFixed(1)}%) exceeds threshold (${MAX_FAILURE_RATE * 100}%)`);
          }
        }
        
        // Check dropped requests
        if (queueStats.stats.dropped > 0) {
          issues.push(`${queueName}: ${queueStats.stats.dropped} requests dropped`);
        }
      }
      
      if (issues.length > 0) {
        return res.status(503).json({
          success: false,
          healthy: false,
          issues,
          stats,
        });
      }
      
      res.json({
        success: true,
        healthy: true,
        message: 'All queues healthy',
        stats,
      });
    } catch (error) {
      console.error('❌ [QUEUE_MONITOR] Error in health check:', error);
      res.status(500).json({
        success: false,
        healthy: false,
        error: 'Health check failed',
        message: error.message,
      });
    }
  }
}

export default new QueueMonitorController();
