import express from 'express';
import {
  recordGame,
  getGames
} from '../controllers/gameController.js';

const router = express.Router();

router.route('/')
  .post(recordGame)
  .get(getGames);

export default router;
