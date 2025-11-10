// routes/surveyRoutes.js
const express = require("express");
const router = express.Router();
const { upload } = require("../middlewares/multer");
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
  submitSurveyResponse,
  updateSurvey,
  deleteSurvey,
  toggleSurveyStatus,
  getSurveyQRCode,
  exportSurveyReport,
  getSurveyResponses,
  getSurveyAnalytics,
} = require("../controllers/surveyController");
const {
  analyzeFeedback,
  generateActions,
  followUp,
} = require("../controllers/feedbackController");
const {
  getExecutiveDashboard,
  getOperationalDashboard,
} = require("../controllers/dashboardController");

// 🟢 Public routes
router.get("/public/all", getPublicSurveys);
router.get("/public/:id", getPublicSurveyById);
router.post("/public/submit", submitSurveyResponse);

// 🟡 Protected routes
router.use(protect);

// 🧩 Middleware: Set tenant only if not admin
const setTenantId = (req, res, next) => {
  if (req.user.role === "admin") {
    return next();
  }
  if (!req.user.tenant) {
    return res
      .status(403)
      .json({ message: "Access denied: No tenant associated with this user" });
  }
  req.tenantId = req.user.tenant._id
    ? req.user.tenant._id.toString()
    : req.user.tenant.toString();
  next();
};

// Apply tenant check after auth
router.use(setTenantId);

// 🧠 ADMIN ROUTES (Full Access — no permission checks)
router.post("/create", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:create"), upload.single("logo"), createSurvey);
router.post("/save-draft", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:create"), upload.single("logo"), createSurvey);
router.get("/", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:read"), getAllSurveys);
router.get("/:id", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:detail:view"), getSurveyById);
router.put("/:id", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:settings:update"), upload.single("logo"), updateSurvey);
router.delete("/:id", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:delete"), deleteSurvey);
router.put("/toggle/:id", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:settings:update"), toggleSurveyStatus);
router.get("/report/:id", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:report:view"), exportSurveyReport);
router.get("/qr/:id", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:share"), getSurveyQRCode);
router.get("/:id/responses", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:responses:view"), getSurveyResponses);
router.get("/:id/analytics", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("survey:analytics:view"), getSurveyAnalytics);
router.post("/feedback/analyze", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("feedback:analyze"), analyzeFeedback);
router.post("/actions/generate", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("action:generate"), generateActions);
router.post("/feedback/follow-up", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("feedback:follow-up"), followUp);
router.get("/dashboards/executive", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("dashboard:view"), getExecutiveDashboard);
router.get("/dashboards/operational", tenantCheck, allowRoles("admin", "companyAdmin"), allowPermission("dashboard:view"), getOperationalDashboard);

module.exports = router;
