// routes/aiRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const {
  aiDraftSurvey,
  aiSuggestQuestion,
  aiOptimizeSurvey,
  aiTranslateSurvey,
  aiGenerateFromCompanyProfile,
  aiSuggestLogic,
  aiGenerateThankYouPage,
  aiAnalyzeFeedback,
  aiGenerateInsights,
} = require("../controllers/aiController");

// Temporarily remove auth for testing - TODO: Re-enable for production
// router.use(protect);

// Core AI survey building
router.post("/draft", aiDraftSurvey);
router.post("/suggest", aiSuggestQuestion);
router.post("/optimize", aiOptimizeSurvey);
router.post("/translate", aiTranslateSurvey);

// Enhanced AI features for flow.md requirements
router.post("/generate-from-profile", aiGenerateFromCompanyProfile);
router.post("/suggest-logic", aiSuggestLogic);
router.post("/generate-thankyou", aiGenerateThankYouPage);
router.post("/analyze-feedback", aiAnalyzeFeedback);
router.post("/generate-insights", aiGenerateInsights);

module.exports = router;