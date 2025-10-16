/**
 * Queue monitoring routes
 * Endpoints for monitoring queue health and performance
 */

import express from 'express';
import queueMonitorController from '../controllers/queueMonitorController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Public health check endpoint (for load balancers, monitoring tools)
router.get('/health', queueMonitorController.healthCheck);

// Protected monitoring endpoints (require authentication)
router.get('/stats', protect, queueMonitorController.getQueueStats);
router.get('/failures', protect, queueMonitorController.getRecentFailures);

export default router;
