import express from 'express';
import {
  registerUser,
  authUser,
  getUserProfile,
  getUserByUsername,
  getUserRecentMatches,
  getUserStats
} from '../controllers/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/', registerUser);
router.post('/login', authUser);
router.get('/profile', protect, getUserProfile);
router.get('/profile/:username', protect, getUserByUsername);
router.get('/profile/:username/matches', protect, getUserRecentMatches);
router.get('/profile/:username/stats', protect, getUserStats);

export default router;
