// routes/surveyRoutes.js
const express = require("express");
const router = express.Router();
const { upload } = require('../middlewares/multer');
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const { allowPermission } = require("../middlewares/permissionMiddleware");
const { tenantCheck } = require("../middlewares/tenantMiddleware");
const {
  createSurvey,
  getAllSurveys,
  getSurveyById,
  getPublicSurveys,
  getPublicSurveyById,
  submitSurvey,
  updateSurvey,
  deleteSurvey,
  toggleSurveyStatus,
  getSurveyQRCode,
  exportSurveyReport,
  getSurveyResponses,
  getSurveyAnalytics,
  createQuestion,
  deleteQuestion
} = require("../controllers/surveyController");
const {
  analyzeFeedback,
  generateActions,
  followUp
} = require("../controllers/feedbackController");
const {
  getExecutiveDashboard,
  getOperationalDashboard
} = require("../controllers/dashboardController");

// Protected routes
router.use(protect, allowRoles("companyAdmin", "admin"));
router.post("/create", allowRoles("companyAdmin"), allowPermission('survey:create'), upload.single("logo"), createSurvey);
router.get("/", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:read'), getAllSurveys);
router.get("/:id", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:detail:view'), getSurveyById);
router.get("/:id/responses", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:responses:view'), getSurveyResponses);
router.get("/:id/analytics", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:analytics:view'), getSurveyAnalytics);
router.get("/qr/:id", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:share'), getSurveyQRCode);
router.get("/report/:id", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:analytics:view'), exportSurveyReport);
router.put("/:id", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:settings:update'), upload.single("logo"), updateSurvey);
router.delete("/:id", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:delete'), deleteSurvey);
router.put("/toggle/:id", tenantCheck, allowRoles("companyAdmin"), allowPermission('survey:settings:update'), toggleSurveyStatus);
router.post("/feedback/analyze", tenantCheck, allowRoles("companyAdmin"), allowPermission('feedback:analyze'), analyzeFeedback);
router.post("/actions/generate", tenantCheck, allowRoles("companyAdmin"), allowPermission('action:generate'), generateActions);
router.post("/feedback/follow-up", tenantCheck, allowRoles("companyAdmin"), allowPermission('feedback:follow-up'), followUp);
router.get("/dashboards/executive", tenantCheck, allowRoles("companyAdmin"), allowPermission('dashboard:view'), getExecutiveDashboard);
router.get("/dashboards/operational", tenantCheck, allowRoles("companyAdmin"), allowPermission('dashboard:view'), getOperationalDashboard);

// Public routes
router.get("/public/all", getPublicSurveys);
router.get("/public/:id", getPublicSurveyById);
router.post("/public/submit", submitSurvey);
router.post("/kiosk/:id", protect, tenantCheck, allowRoles("companyAdmin"), submitSurvey);

module.exports = router;