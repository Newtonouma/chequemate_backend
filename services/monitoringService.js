// Monitoring service for tracking system health and performance metrics
import pool from "../config/database.js";

class MonitoringService {
  constructor() {
    this.metrics = {
      payments: {
        total: 0,
        successful: 0,
        failed: 0,
        pending: 0,
        totalAmount: 0,
      },
      matches: {
        total: 0,
        completed: 0,
        abandoned: 0,
        active: 0,
      },
      performance: {
        avgResponseTime: 0,
        apiCallCount: 0,
        errorCount: 0,
      },
      alerts: [],
    };

    this.thresholds = {
      paymentFailureRate: 0.1, // Alert if >10% payments fail
      lowMerchantBalance: 10000, // Alert if merchant balance < 10,000 KSH
      stuckPaymentMinutes: 30, // Alert if payment pending > 30 minutes
      abandonedMatchHours: 2, // Alert if match active > 2 hours without result
      highErrorRate: 0.05, // Alert if >5% of requests error
    };

    console.log("📊 [MONITORING] Monitoring service initialized");

    // Collect metrics every 5 minutes
    setInterval(() => this.collectMetrics(), 5 * 60 * 1000);

    // Check for alerts every minute
    setInterval(() => this.checkAlerts(), 60 * 1000);
  }

  async collectMetrics() {
    try {
      // Payment metrics (last 24 hours)
      const paymentQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as successful,
          COUNT(*) FILTER (WHERE status = 'failed') as failed,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          SUM(amount) FILTER (WHERE status = 'completed') as total_amount
        FROM payments
        WHERE created_at > NOW() - INTERVAL '24 hours';
      `;

      const paymentResult = await pool.query(paymentQuery);
      const paymentData = paymentResult.rows[0];

      this.metrics.payments = {
        total: parseInt(paymentData.total || 0),
        successful: parseInt(paymentData.successful || 0),
        failed: parseInt(paymentData.failed || 0),
        pending: parseInt(paymentData.pending || 0),
        totalAmount: parseFloat(paymentData.total_amount || 0),
      };

      // Match metrics (last 24 hours)
      const matchQuery = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE result_checked = TRUE AND result != 'no_result_refunded') as completed,
          COUNT(*) FILTER (WHERE result = 'no_result_refunded') as abandoned,
          COUNT(*) FILTER (WHERE result_checked = FALSE) as active
        FROM ongoing_matches
        WHERE created_at > NOW() - INTERVAL '24 hours';
      `;

      const matchResult = await pool.query(matchQuery);
      const matchData = matchResult.rows[0];

      this.metrics.matches = {
        total: parseInt(matchData.total || 0),
        completed: parseInt(matchData.completed || 0),
        abandoned: parseInt(matchData.abandoned || 0),
        active: parseInt(matchData.active || 0),
      };

      console.log("📊 [MONITORING] Metrics collected:", {
        paymentSuccessRate: `${this.getPaymentSuccessRate()}%`,
        matchCompletionRate: `${this.getMatchCompletionRate()}%`,
        totalRevenue: `${this.metrics.payments.totalAmount} KSH`,
      });
    } catch (error) {
      console.error("❌ [MONITORING] Error collecting metrics:", error);
    }
  }

  async checkAlerts() {
    this.metrics.alerts = [];

    try {
      // Alert 1: High payment failure rate
      const failureRate = this.getPaymentFailureRate();
      if (
        failureRate > this.thresholds.paymentFailureRate &&
        this.metrics.payments.total > 10
      ) {
        this.createAlert("HIGH_PAYMENT_FAILURE_RATE", {
          level: "critical",
          message: `Payment failure rate is ${(failureRate * 100).toFixed(
            1
          )}% (threshold: ${this.thresholds.paymentFailureRate * 100}%)`,
          value: failureRate,
          action: "Check ONIT merchant balance and system logs",
        });
      }

      // Alert 2: Stuck payments (pending > 30 minutes)
      const stuckPaymentsQuery = `
        SELECT COUNT(*) as stuck_count
        FROM payments
        WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '${this.thresholds.stuckPaymentMinutes} minutes';
      `;

      const stuckResult = await pool.query(stuckPaymentsQuery);
      const stuckCount = parseInt(stuckResult.rows[0].stuck_count || 0);

      if (stuckCount > 0) {
        this.createAlert("STUCK_PAYMENTS", {
          level: "warning",
          message: `${stuckCount} payment(s) stuck in pending state for >${this.thresholds.stuckPaymentMinutes} minutes`,
          value: stuckCount,
          action: "Investigate payment callback issues or ONIT API status",
        });
      }

      // Alert 3: Abandoned matches (active > 2 hours)
      const abandonedMatchesQuery = `
        SELECT COUNT(*) as abandoned_count
        FROM ongoing_matches
        WHERE result_checked = FALSE
        AND created_at < NOW() - INTERVAL '${this.thresholds.abandonedMatchHours} hours';
      `;

      const abandonedResult = await pool.query(abandonedMatchesQuery);
      const abandonedCount = parseInt(
        abandonedResult.rows[0].abandoned_count || 0
      );

      if (abandonedCount > 0) {
        this.createAlert("ABANDONED_MATCHES", {
          level: "info",
          message: `${abandonedCount} match(es) active for >${this.thresholds.abandonedMatchHours} hours without result`,
          value: abandonedCount,
          action:
            "Auto-refund will trigger after max checks. Monitor PerMatchResultChecker logs.",
        });
      }

      // Alert 4: Check merchant balance (requires ONIT API integration)
      // TODO: Add ONIT API call to check actual merchant balance
      // For now, we can check if recent payouts are failing
      const recentPayoutFailuresQuery = `
        SELECT COUNT(*) as failed_payouts
        FROM payments
        WHERE transaction_type = 'withdrawal'
        AND status = 'failed'
        AND created_at > NOW() - INTERVAL '1 hour';
      `;

      const payoutResult = await pool.query(recentPayoutFailuresQuery);
      const failedPayouts = parseInt(payoutResult.rows[0].failed_payouts || 0);

      if (failedPayouts > 2) {
        this.createAlert("MULTIPLE_PAYOUT_FAILURES", {
          level: "critical",
          message: `${failedPayouts} payout(s) failed in the last hour - possible merchant balance issue`,
          value: failedPayouts,
          action: "URGENT: Check ONIT merchant account balance immediately",
        });
      }

      if (this.metrics.alerts.length > 0) {
        console.warn("⚠️ [MONITORING] Active alerts:", this.metrics.alerts);
      }
    } catch (error) {
      console.error("❌ [MONITORING] Error checking alerts:", error);
    }
  }

  createAlert(type, details) {
    const alert = {
      type,
      ...details,
      timestamp: new Date().toISOString(),
    };

    this.metrics.alerts.push(alert);

    // Log critical alerts immediately
    if (details.level === "critical") {
      console.error(`🚨 [MONITORING] CRITICAL ALERT: ${type}`, details);
    } else if (details.level === "warning") {
      console.warn(`⚠️ [MONITORING] WARNING: ${type}`, details);
    } else {
      console.log(`ℹ️ [MONITORING] INFO: ${type}`, details);
    }

    // TODO: Send alerts via webhook, email, or SMS
    // this.sendAlertNotification(alert);
  }

  // Calculate payment success rate
  getPaymentSuccessRate() {
    if (this.metrics.payments.total === 0) return 100;
    return (
      (this.metrics.payments.successful / this.metrics.payments.total) *
      100
    ).toFixed(1);
  }

  // Calculate payment failure rate
  getPaymentFailureRate() {
    if (this.metrics.payments.total === 0) return 0;
    return this.metrics.payments.failed / this.metrics.payments.total;
  }

  // Calculate match completion rate
  getMatchCompletionRate() {
    if (this.metrics.matches.total === 0) return 100;
    return (
      (this.metrics.matches.completed / this.metrics.matches.total) *
      100
    ).toFixed(1);
  }

  // Get current metrics and alerts
  getStatus() {
    return {
      metrics: this.metrics,
      rates: {
        paymentSuccessRate: `${this.getPaymentSuccessRate()}%`,
        paymentFailureRate: `${(this.getPaymentFailureRate() * 100).toFixed(
          1
        )}%`,
        matchCompletionRate: `${this.getMatchCompletionRate()}%`,
      },
      thresholds: this.thresholds,
      activeAlerts: this.metrics.alerts.length,
      health: this.getHealthStatus(),
    };
  }

  // Overall system health status
  getHealthStatus() {
    const criticalAlerts = this.metrics.alerts.filter(
      (a) => a.level === "critical"
    );
    const warningAlerts = this.metrics.alerts.filter(
      (a) => a.level === "warning"
    );

    if (criticalAlerts.length > 0) return "critical";
    if (warningAlerts.length > 0) return "warning";
    if (this.getPaymentFailureRate() > 0.05) return "degraded";
    return "healthy";
  }

  // Manual trigger for metrics collection (used by API endpoint)
  async forceCollectMetrics() {
    await this.collectMetrics();
    await this.checkAlerts();
    return this.getStatus();
  }

  // Cleanup method
  cleanup() {
    console.log("✅ [MONITORING] Cleanup completed");
  }
}

const monitoringService = new MonitoringService();
export default monitoringService;
