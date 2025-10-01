// routes/dashboardRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { setTenantId } = require("../middlewares/tenantMiddleware");
const { getExecutiveDashboard, getOperationalDashboard } = require("../controllers/dashboardController");

router.use(protect, setTenantId);
router.get("/executive", getExecutiveDashboard);
router.get("/operational", getOperationalDashboard);
module.exports = router;