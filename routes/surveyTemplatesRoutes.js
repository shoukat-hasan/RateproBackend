// routes/surveyTemplatesRoutes.js
const express = require("express");
const router = express.Router();
const { upload } = require("../middlewares/multer");
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const { allowPermission } = require("../middlewares/permissionMiddleware");
const {} = require("../middlewares/tenantMiddleware");

const {
  getAllSurveyTemplates,
  getSurveyTemplateById,
  createSurveyTemplate,
  updateSurveyTemplate,
  deleteSurveyTemplate,
  useSurveyTemplate,
  previewSurveyTemplate,
  updateTemplateStatus,
  saveDraftTemplate,
} = require("../controllers/surveyTemplatesController");

// 🟢 PUBLIC ROUTES (if any in the future)
// Example: router.get("/public/all", getPublicTemplates);

// 🟡 PROTECTED ROUTES
router.use(protect);

// 🧩 Set Tenant ID (same as surveyRoutes)
const setTenantId = (req, res, next) => {
  if (req.user.role === "admin") return next();
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

// Apply tenant check after authentication
router.use(setTenantId);

// 🧠 ADMIN & COMPANY ADMIN ROUTES
router.post("/create", allowRoles("admin"), allowPermission("template:create"), upload.single("thumbnail"), createSurveyTemplate);
router.put("/:id", allowRoles("admin"), allowPermission("template:update"), upload.single("thumbnail"), updateSurveyTemplate);
router.delete("/:id", allowRoles("admin"), allowPermission("template:delete"), deleteSurveyTemplate);
router.patch("/:id/status", allowRoles("admin"), allowPermission("template:update"), updateTemplateStatus);
router.get("/", allowRoles("admin", "companyAdmin", "member"), allowPermission("template:read"), getAllSurveyTemplates);
router.get("/:id", allowRoles("admin", "companyAdmin", "member"), allowPermission("template:detail:view"), getSurveyTemplateById);
// 🔁 Template Usage & Preview
router.patch("/:id/use", allowRoles("admin", "companyAdmin", "member"), allowPermission("template:use"), useSurveyTemplate);
router.get("/:id/preview", allowRoles("admin", "companyAdmin", "member"), allowPermission("template:preview"), previewSurveyTemplate);

router.post("/save-from-survey", allowRoles("admin"), saveDraftTemplate);

module.exports = router;
