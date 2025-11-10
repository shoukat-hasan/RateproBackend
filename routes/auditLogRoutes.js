// routes/auditlogRoutes.js
const express = require('express');
const {
  createLog,
  getLogs,
  getLogById,
  getLogStatistics,
  deleteLog,
  cleanOldLogs
} = require('../controllers/auditLogController.js');
const { protect } = require('../middlewares/authMiddleware.js');
const { allowRoles } =  require('../middlewares/roleMiddleware.js');

const router = express.Router();

// Public route for creating logs (can be used by any service)
router.post('/', createLog);

// Protected admin routes
router.get('/', protect, allowRoles("admin"), getLogs);
router.get('/statistics', protect,  allowRoles("admin"), getLogStatistics);
router.get('/:id', protect,  allowRoles("admin"), getLogById);
router.delete('/:id', protect,  allowRoles("admin"), deleteLog);
router.post('/maintenance/clean', protect,  allowRoles("admin"), cleanOldLogs);

module.exports = router;