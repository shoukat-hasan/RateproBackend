// routes/contactManagementRoutes.js
const express = require("express");
const router = express.Router();
const { excelUpload }  = require('../middlewares/multer');

const {
    getContacts,
    getContactById,
    createContact,
    updateContact,
    deleteContact,
    exportContactsExcel,
    exportContactsPDF,
    bulkCreateContacts
}
 = require("../controllers/contactManagementController");
const { setTenantId } = require("../middlewares/tenantMiddleware");
const { allowRoles } = require('../middlewares/roleMiddleware');

router.get("/", setTenantId, allowRoles("companyAdmin", "admin"), getContacts);
router.post("/", setTenantId, allowRoles("companyAdmin", "admin"), createContact);

// Bulk upload
router.post(
  "/bulk-upload",
  setTenantId,
  allowRoles("companyAdmin"),
  excelUpload.single("excel"),
  bulkCreateContacts
);

// Export routes
router.get("/export/excel", setTenantId, allowRoles("companyAdmin", "admin"), exportContactsExcel);
router.get("/export/pdf", setTenantId, allowRoles("companyAdmin", "admin"), exportContactsPDF);

// Dynamic routes
router.get("/:id", setTenantId, allowRoles("companyAdmin", "admin"), getContactById);
router.put("/:id", setTenantId, allowRoles("companyAdmin", "admin"), updateContact);
router.delete("/:id", setTenantId, allowRoles("companyAdmin", "admin"), deleteContact);

module.exports = router;