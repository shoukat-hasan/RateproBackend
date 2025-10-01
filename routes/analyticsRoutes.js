// routes/analyticsRoutes.js
const express = require("express");
const router = express.Router();
const {
  getSurveyStats,
  getTenantStats,
  getExecutiveDashboard,
  getOperationalDashboard,
  getTrendsAnalytics,
  getAlerts
} = require("../controllers/analyticsController");

const { protect } = require("../middlewares/authMiddleware");
const { setTenantId } = require("../middlewares/tenantMiddleware");

// Apply authentication and tenant middleware to all routes
router.use(protect);
router.use(setTenantId);

// Legacy routes (for backward compatibility)
router.get("/survey/:surveyId", getSurveyStats);
router.get("/tenant", getTenantStats);

// ===== ENHANCED DASHBOARD ANALYTICS ROUTES (Flow.md Section 8) =====

/**
 * @route   GET /api/analytics/executive
 * @desc    Get executive dashboard analytics (CSI, NPS, Response Rate)
 * @access  Private (Admin/Manager)
 * @params  ?range=7d|30d|90d (default: 30d)
 */
router.get("/executive", getExecutiveDashboard);

/**
 * @route   GET /api/analytics/operational
 * @desc    Get operational dashboard analytics (Alerts, SLA, Top Issues)
 * @access  Private (Admin/Manager/Operator)
 * @params  ?range=7d|30d|90d (default: 30d)
 */
router.get("/operational", getOperationalDashboard);

/**
 * @route   GET /api/analytics/trends
 * @desc    Get trend analytics (Satisfaction trends, Volume trends)
 * @access  Private (Admin/Manager)
 * @params  ?range=7d|30d|90d (default: 30d)
 */
router.get("/trends", getTrendsAnalytics);

/**
 * @route   GET /api/analytics/alerts
 * @desc    Get real-time smart alerts
 * @access  Private (All authenticated users)
 */
router.get("/alerts", getAlerts);

module.exports = router;