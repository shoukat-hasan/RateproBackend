// routes/insightRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { getPredictiveInsights } = require("../controllers/insightController");

router.get("/predictive/:surveyId", protect, getPredictiveInsights);

module.exports = router;
