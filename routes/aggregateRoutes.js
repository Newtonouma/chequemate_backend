import express from 'express';
import { getCurrentUserAllData, getUserAllData } from '../controllers/aggregateController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Get all data for current user (wallet, stats, matches, etc.)
router.get('/me/all', protect, getCurrentUserAllData);

// Get all data for a specific user (stats, matches, etc. - no wallet)
router.get('/:username/all', protect, getUserAllData);

export default router;
