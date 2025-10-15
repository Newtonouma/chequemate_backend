import express from "express";
import {
  createMatch,
  getChallenges,
  acceptChallenge,
  declineChallenge,
  cancelChallenge,
  postponeChallenge,
  deleteChallenge,
} from "../controllers/challengeController.js";
import { validatePhone } from "../middleware/phoneValidation.js";

const router = express.Router();

router.post("/", createMatch);
router.get("/:userId", getChallenges);
router.post("/:challengeId/accept", validatePhone, acceptChallenge);
router.post("/:challengeId/decline", declineChallenge);
router.post("/:challengeId/cancel", cancelChallenge);
router.post("/:challengeId/postpone", postponeChallenge);
router.delete("/:challengeId", deleteChallenge);

export default router;
