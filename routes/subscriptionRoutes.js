// // routes/subscriptionRoutes.js
// const express = require("express");
// const router = express.Router();
// const { protect } = require("../middlewares/authMiddleware");
// const { allowRoles } = require("../middlewares/roleMiddleware");
// const { 
//   getSubscription,
//   requestUpgrade,
//   cancelSubscription
// } = require("../controllers/subscriptionController");

// // Protected routes (companyAdmin only)
// router.use(protect, allowRoles("companyAdmin"));

// router.get("/", getSubscription);              // get current tenant subscription
// router.post("/upgrade", requestUpgrade);       // request plan upgrade
// router.post("/cancel", cancelSubscription);    // cancel active subscription

// module.exports = router;
// routes/subscriptionRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const {
  getCurrentSubscription,
  requestUpgrade,
  cancelSubscription,
  getAvailablePlans,
  activateSubscription,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  getAllSubscriptionPlans,
  updateSubscription
} = require("../controllers/subscriptionController");
const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');

// ==================== COMPANY ADMIN ROUTES ====================
router.use("/user", protect, allowRoles("companyAdmin"), (req, res, next) => {
  next();
});

// Get current tenant subscription
router.get("/user", getCurrentSubscription);

// update subscription
router.put("/user/:id/update", updateSubscription)

// Get available plans for selection
router.get("/user/plans/available", getAvailablePlans);

// Activate subscription after payment
router.post("/user/activate", activateSubscription);

// Request plan upgrade
router.post("/user/upgrade", requestUpgrade);

// Cancel subscription
router.post("/user/cancel", cancelSubscription);

// ==================== ADMIN ROUTES ====================
router.use("/admin", protect, allowRoles("admin"), (req, res, next) => {
  next();
});

// Admin plan management
router.post("/admin/plans", createSubscriptionPlan);
router.get("/admin/plans", getAllSubscriptionPlans);
router.put("/admin/plans/:planId", updateSubscriptionPlan);
router.delete("/admin/plans/:planId", deleteSubscriptionPlan);


module.exports = router;