import express from "express";
import paymentController from "../controllers/paymentController.js";
import { protect } from "../middleware/auth.js";
import { validatePhone } from "../middleware/phoneValidation.js";

const router = express.Router();

// Initiate deposit (requires authentication + phone validation)
router.post(
  "/deposit",
  protect,
  validatePhone,
  paymentController.initiateDeposit
);

// Initiate withdrawal/payout (requires authentication + phone validation)
router.post(
  "/withdraw",
  protect,
  validatePhone,
  paymentController.initiateWithdrawal
);

// Payment callback (webhook from payment provider - no auth required)
router.post("/callback", (req, res) => paymentController.handleCallback(req, res));

// Get payment status (requires authentication)
router.get("/status", protect, paymentController.getPaymentStatus);

export default router;
