// // routes/tenantRoutes.js
// const express = require("express");
// const router = express.Router();
// const { protect } = require("../middlewares/authMiddleware");
// const { allowRoles } = require("../middlewares/roleMiddleware");
// const tenantController = require("../controllers/tenantController");

// // Admin only routes
// router.use(protect, allowRoles("admin"));

// router.post("/", tenantController.createTenant);
// router.get("/", tenantController.getTenants);
// router.put("/deactivate/:id", tenantController.deactivateTenant);
// router.put("/delete/:id", tenantController.deleteTenant);

// module.exports = router;

// routes/tenant.js
const express = require('express');
const router = express.Router();
const { updateTenant } = require('../controllers/tenantController');
const { getTenant } = require('../controllers/tenantController');
const { protect } = require('../middlewares/authMiddleware'); // Middleware to set req.user

router.put('/:tenantId', protect, updateTenant);
router.get('/:id', protect, getTenant);
// router.get('/members/:tenantId', protect, getTenantMembers);

module.exports = router;