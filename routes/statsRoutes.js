import express from 'express';
import {
  getUserStats,
  getMultipleUserStats,
  clearUserStatsCache,
  getCacheStatus
} from '../controllers/statsController.js';

const router = express.Router();

// User stats routes
router.get('/user/:username', getUserStats);
router.post('/users', getMultipleUserStats);
router.delete('/user/:username', clearUserStatsCache);
router.get('/cache/status', getCacheStatus);

export default router;