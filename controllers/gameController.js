import asyncHandler from 'express-async-handler';
import Game from '../models/Game.js';
import Challenge from '../models/Challenge.js';

// @desc    Record a game result
// @route   POST /api/games
// @access  Private
export const recordGame = asyncHandler(async (req, res) => {
  const { challengeId, result } = req.body;

  if (!challengeId || !result) {
    res.status(400);
    throw new Error('Please include challengeId and result');
  }

  const challenge = await Challenge.findById(challengeId);
  if (!challenge) {
    res.status(404);
    throw new Error('Challenge not found');
  }

  const game = await Game.create({
    challenge: challenge._id,
    result
  });

  challenge.status = 'completed';
  await challenge.save();

  res.status(201).json(game);
});

// @desc    Get all games
// @route   GET /api/games
// @access  Private
export const getGames = asyncHandler(async (req, res) => {
  const games = await Game.find()
    .populate({
      path: 'challenge',
      populate: [
        { path: 'challenger', select: 'username' },
        { path: 'opponent', select: 'username' }
      ]
    });

  res.json(games);
});