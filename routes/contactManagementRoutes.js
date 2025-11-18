// routes/contactManagementRoutes.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });

const {
    getContacts,
    getContactById,
    createContact,
    updateContact,
    deleteContact,
    exportContactsExcel,
    exportContactsPDF
}
 = require("../controllers/contactManagementController");
const { setTenantId } = require("../middlewares/tenantMiddleware");
const { allowRoles } = require('../middlewares/roleMiddleware');

router.get("/", setTenantId, allowRoles("companyAdmin", "admin"), getContacts);
router.post("/", setTenantId, allowRoles("companyAdmin", "admin"), createContact);

// Dynamic routes LAST
router.get("/:id", setTenantId, allowRoles("companyAdmin", "admin"), getContactById);
router.put("/:id", setTenantId, allowRoles("companyAdmin", "admin"), updateContact);
router.delete("/:id", setTenantId, allowRoles("companyAdmin", "admin"), deleteContact);

// export/pdf routes
router.get("/export/excel", setTenantId, allowRoles("companyAdmin", "admin"), exportContactsExcel);
router.get("/export/pdf", setTenantId, allowRoles("companyAdmin", "admin"), exportContactsPDF);

module.exports = router;