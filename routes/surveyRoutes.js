// routes/surveyRoutes.js

const express = require("express");
const router = express.Router();
// const upload = require("../middlewares/multer");
const { upload } = require('../middlewares/multer');
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");

const {
  createSurvey,
  getAllSurveys,
  getSurveyById,
  getPublicSurveys,
  submitSurvey,
  updateSurvey,
  deleteSurvey,
  toggleSurveyStatus,
  getSurveyQRCode,
  exportSurveyReport,
  getSurveyResponses,
  getSurveyAnalytics

} = require("../controllers/surveyController");

// ========== COMPANY & ADMIN ROUTES ==========
router.use(protect, allowRoles("company", "admin"));

router.post("/", upload.single("logo"), createSurvey);
router.get("/", getAllSurveys);
router.get("/qr/:id", getSurveyQRCode);
router.get("/report/:id", exportSurveyReport);
router.get("/:id", getSurveyById);
router.put("/:id", upload.single("logo"), updateSurvey);
router.delete("/:id", deleteSurvey);
router.put("/toggle/:id", toggleSurveyStatus);
router.get("/:id", getSurveyResponses);
router.get("/:id", getSurveyAnalytics);

// ========== PUBLIC/USER ROUTES (no auth required) ==========

router.get("/public/all", getPublicSurveys);
router.post("/public/submit", submitSurvey);


module.exports = router;