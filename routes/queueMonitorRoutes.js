/**
 * Queue monitoring routes
 * Endpoints for monitoring queue health and performance
 */

import express from 'express';
import queueMonitorController from '../controllers/queueMonitorController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public health check endpoint (for load balancers, monitoring tools)
router.get('/health', queueMonitorController.healthCheck);

// Protected monitoring endpoints (require authentication)
router.get('/stats', authenticate, queueMonitorController.getQueueStats);
router.get('/failures', authenticate, queueMonitorController.getRecentFailures);

export default router;
