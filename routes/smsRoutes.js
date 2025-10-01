// routes/smsRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const { sendSMSHandler } = require("../controllers/smsController");

// Protected: only companyAdmin and member can send SMS
router.use(protect);
router.post("/", allowRoles("companyAdmin", "member"), sendSMSHandler);

module.exports = router;
