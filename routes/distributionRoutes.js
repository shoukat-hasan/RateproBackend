// routes/distributionRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { setTenantId } = require('../middlewares/tenantMiddleware');
const { sendSurveyWhatsApp, whatsappWebhook } = require('../controllers/distributionController');
const { allowRoles } = require('../middlewares/roleMiddleware');

router.post('/whatsapp/send', protect, setTenantId, allowRoles('companyAdmin', 'member'), sendSurveyWhatsApp);

// Public webhook endpoint (no protect) - must secure with provider verification tokens in production
router.post('/whatsapp/webhook', whatsappWebhook);

module.exports = router;
