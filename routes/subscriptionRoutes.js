// routes/subscriptionRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const { 
  getSubscription,
  requestUpgrade,
  cancelSubscription
} = require("../controllers/subscriptionController");

// Protected routes (companyAdmin only)
router.use(protect, allowRoles("companyAdmin"));

router.get("/", getSubscription);              // get current tenant subscription
router.post("/upgrade", requestUpgrade);       // request plan upgrade
router.post("/cancel", cancelSubscription);    // cancel active subscription

module.exports = router;
