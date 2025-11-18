// RateproBackend/routes/audienceSegmentRoutes.js
const express = require("express");
const {
    getSegments,
    createSegment,
    updateSegment,
    deleteSegment,
    previewSegment,
    exportSegmentExcel,
    exportSegmentPDF,
    getAllSegments
} = require("../controllers/audienceSegmentationController.js");
const { setTenantId } = require("../middlewares/tenantMiddleware.js");
const { allowRoles } = require("../middlewares/roleMiddleware.js");

const router = express.Router();

router.get("/", setTenantId, allowRoles("admin", "companyAdmin"), getSegments);
router.get("/all", setTenantId, allowRoles("admin", "companyAdmin"), getAllSegments);
router.post("/", setTenantId, allowRoles("admin", "companyAdmin"), createSegment);
router.put("/:id", setTenantId, allowRoles("admin", "companyAdmin"), updateSegment);
router.delete("/:id", setTenantId, allowRoles("admin", "companyAdmin"), deleteSegment);

router.post("/preview", setTenantId, allowRoles("admin", "companyAdmin"), previewSegment);

router.get("/:id/export/excel", setTenantId, allowRoles("admin", "companyAdmin"), exportSegmentExcel);
router.get("/:id/export/pdf", setTenantId, allowRoles("admin", "companyAdmin"), exportSegmentPDF);

module.exports = router;