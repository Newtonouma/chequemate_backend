import express from "express";
import monitoringService from "../services/monitoringService.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Get monitoring metrics and alerts (admin/authenticated users only)
router.get("/status", protect, async (req, res) => {
  try {
    const status = await monitoringService.forceCollectMetrics();
    res.json(status);
  } catch (error) {
    console.error("Error fetching monitoring status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch monitoring status",
      error: error.message,
    });
  }
});

// Get current metrics without forcing collection (faster)
router.get("/metrics", protect, (req, res) => {
  try {
    const status = monitoringService.getStatus();
    res.json(status);
  } catch (error) {
    console.error("Error fetching metrics:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch metrics",
      error: error.message,
    });
  }
});

// Health check endpoint (public, for uptime monitoring services)
router.get("/health", (req, res) => {
  try {
    const status = monitoringService.getStatus();
    const healthStatus = status.health;

    const statusCode =
      healthStatus === "healthy"
        ? 200
        : healthStatus === "degraded"
        ? 200
        : healthStatus === "warning"
        ? 503
        : 503; // critical

    res.status(statusCode).json({
      status: healthStatus,
      timestamp: new Date().toISOString(),
      alerts: status.activeAlerts,
      paymentSuccessRate: status.rates.paymentSuccessRate,
      matchCompletionRate: status.rates.matchCompletionRate,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
