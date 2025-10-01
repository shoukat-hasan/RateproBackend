// routes/feedbackRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const { setTenantId } = require("../middlewares/tenantMiddleware");
const { analyzeFeedback, generateActions, followUp } = require("../controllers/feedbackController");

router.use(protect, setTenantId);
router.post("/analyze", allowRoles("companyAdmin", "member"), analyzeFeedback);
router.post("/actions/generate", allowRoles("companyAdmin", "member"), generateActions);
router.post("/follow-up", allowRoles("companyAdmin", "member"), followUp);
module.exports = router;
