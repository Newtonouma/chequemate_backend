import express from "express";
import {
  getWallet,
  depositFunds,
  withdrawFunds,
} from "../controllers/walletController.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

router.use(protect); // All wallet routes require authentication

router.get("/", getWallet);
router.post("/deposit", depositFunds);
router.post("/withdraw", withdrawFunds);

export default router;
