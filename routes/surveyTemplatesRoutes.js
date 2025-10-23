// /routes/surveyTemplatesRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware.js");
const { allowRoles } = require("../middlewares/roleMiddleware.js");
const {
  getAllSurveyTemplates,
  getSurveyTemplateById,
  createSurveyTemplate,
  updateSurveyTemplate,
  deleteSurveyTemplate,
  useSurveyTemplate,
  previewSurveyTemplate,
  seedSurveyTemplates,
} = require("../controllers/surveyTemplatesController.js");

// 🧩 Set tenantId middleware (like userRoutes)
const setTenantId = (req, res, next) => {
  // ✅ Skip tenant check for Admin users
  if (req.user.role === "admin") {
    console.log("setTenantId: Admin user detected, skipping tenant validation");
    return next();
  }

  // 🔒 Ensure user has tenant
  if (!req.user.tenant) {
    console.error("setTenantId: No tenant found for user", { userId: req.user._id });
    return res.status(403).json({ message: "Access denied: No tenant associated with this user" });
  }

  // ✅ Set tenantId
  req.tenantId = req.user.tenant._id
    ? req.user.tenant._id.toString()
    : req.user.tenant.toString();
  console.log("setTenantId: Set tenantId", { tenantId: req.tenantId });
  next();
};

// 🧠 Public routes (if any in future)
// e.g. router.get("/public", getPublicTemplates);

// 🧩 Protected routes
router.use(protect, setTenantId);

// 📋 Survey Template Management Routes
router.get("/", allowRoles("admin", "companyAdmin", "member"), getAllSurveyTemplates);
router.get("/:id", allowRoles("admin", "companyAdmin", "member"), getSurveyTemplateById);
router.post("/", allowRoles("admin"), createSurveyTemplate); // Only admin can create
router.put("/:id", allowRoles("admin"), updateSurveyTemplate);
router.delete("/:id", allowRoles("admin"), deleteSurveyTemplate);

// 🔁 Template Usage / Preview Routes
router.patch("/:id/use", allowRoles("companyAdmin", "admin"), useSurveyTemplate);
router.get("/:id/preview", allowRoles("admin", "companyAdmin", "member"), previewSurveyTemplate);

module.exports = router;
