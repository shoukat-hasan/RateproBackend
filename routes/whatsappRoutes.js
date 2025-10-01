// routes/whatsappRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/authMiddleware');
const { setTenantId } = require('../middlewares/tenantMiddleware');
const { upsertWhatsAppSetting, getWhatsAppSetting } = require('../controllers/whatsappController');
const { allowRoles } = require('../middlewares/roleMiddleware');

router.use(protect, setTenantId);
router.post('/', allowRoles('companyAdmin'), upsertWhatsAppSetting);
router.get('/', allowRoles('companyAdmin'), getWhatsAppSetting);

module.exports = router;
