import express from "express";
import {
  register,
  login,
  updateProfile,
  validatePlayer,
  getCurrentRating,
  getRecentMatches,
} from "../controllers/authController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.put("/profile", protect, updateProfile);
router.post("/validate-player", validatePlayer);
router.get("/validate-token", protect, (req, res) => {
  // If we reach here, the token is valid (protect middleware validated it)
  res.json({ success: true, user: req.user });
});
router.get("/current-rating", protect, getCurrentRating);
router.get("/recent-matches", protect, getRecentMatches);

export default router;
