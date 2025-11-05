// src/routes/emailTemplateRoutes.js
const express = require("express");
const {
  createTemplate,
  getTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  toggleTemplateStatus,
} = require("../controllers/emailTemplateController");
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");

const router = express.Router();

// ALL routes require authentication
router.use(protect);

// 📧 VIEW TEMPLATES (All authenticated users)
router.get("/", allowRoles("admin", "companyAdmin", "member", "user"), getTemplates);
router.get("/:id", allowRoles("admin", "companyAdmin", "member", "user"), getTemplateById);

// 📧 MANAGE TEMPLATES (Only admin and companyAdmin)
router.post("/", allowRoles("admin", "companyAdmin"), createTemplate);
router.put("/:id", allowRoles("admin", "companyAdmin"), updateTemplate);
router.delete("/:id", allowRoles("admin", "companyAdmin"), deleteTemplate);
router.patch("/:id/toggle-status", allowRoles("admin", "companyAdmin"), toggleTemplateStatus);

module.exports = router;