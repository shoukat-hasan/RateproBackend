// // routes/ticketRoutes.js
const express = require('express');
const router = express.Router();
const { upload } = require('../middlewares/multer');
const { protect } = require('../middlewares/authMiddleware');
const { allowRoles } = require('../middlewares/roleMiddleware');
const { allowPermission } = require('../middlewares/permissionMiddleware');
const { setTenantId, tenantCheck } = require('../middlewares/tenantMiddleware');

const {
  createTicket,
  getTickets,
  getTicketById,
  updateTicket,
  updateTicketStatus,
  deleteTicket,
  getTicketStats,
  addComment,
  getComments,
} = require('../controllers/ticketController');

// Apply protect + tenant middleware globally
router.use(protect, setTenantId);

// ---------- ADMIN / COMPANY ADMIN ROUTES ----------
router.get('/stats', allowRoles('admin', 'companyAdmin'), getTicketStats);

router.post(
  '/',
  allowRoles('admin', 'companyAdmin'),
  upload.array('attachments', 2),
  createTicket
);
router.get('/', allowRoles('admin', 'companyAdmin'), getTickets);
router.get('/:id', allowRoles('admin', 'companyAdmin'), getTicketById);
router.put('/:id', allowRoles('admin', 'companyAdmin'), updateTicket);
router.patch('/:id/status', allowRoles('admin', 'companyAdmin'), updateTicketStatus);
router.delete('/:id', allowRoles('admin', 'companyAdmin'), deleteTicket);

// ---------- MEMBER ROUTES WITH PERMISSIONS ----------
router.post(
  '/',
  allowRoles('member'),
  allowPermission('ticket:create'),
  upload.array('attachments', 2),
  createTicket
);
router.get('/', allowRoles('member'), allowPermission('ticket:read'), getTickets);
router.get('/:id', allowRoles('member'), allowPermission('ticket:read'), getTicketById);
router.put('/:id', allowRoles('member'), allowPermission('ticket:update'), updateTicket);
router.patch('/:id/status', allowRoles('member'), allowPermission('ticket:update'), updateTicketStatus);
router.delete('/:id', allowRoles('member'), allowPermission('ticket:delete'), deleteTicket);

// ---------- COMMENTS ----------
router.post('/:id/comments', tenantCheck, allowRoles('admin', 'companyAdmin', 'member'), addComment);
router.get('/:id/comments', tenantCheck, allowRoles('admin', 'companyAdmin', 'member'), getComments);

module.exports = router;