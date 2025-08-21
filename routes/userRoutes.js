// // const express = require("express");
// // const router = express.Router();
// // const upload = require("../middlewares/multer");
// // const { protect } = require("../middlewares/authMiddleware");
// // const { allowRoles } = require("../middlewares/roleMiddleware");

// // const {
// //   createUser,
// //   updateUser,
// //   deleteUser,
// //   toggleActive,
// //   getAllUsers,
// //   getUserById,
// //   exportUserDataPDF,
// //   sendNotification,
// // } = require("../controllers/userController");

// // // Admin + Company Roles
// // router.use(protect, allowRoles("admin", "company"));

// // router.post("/", createUser);
// // router.get("/", getAllUsers);
// // router.get("/:id", getUserById);
// // router.put("/:id", upload.single("avatar"), updateUser);
// // router.delete("/:id", deleteUser);
// // router.put("/toggle/:id", toggleActive);
// // router.get("/export/:id", exportUserDataPDF);
// // router.post("/notify/:id", sendNotification);

// // module.exports = router;
// const express = require("express");
// const router = express.Router();
// const upload = require("../middlewares/multer");
// const { protect } = require("../middlewares/authMiddleware");
// const { allowRoles } = require("../middlewares/roleMiddleware");

// const {
//   createUser,
//   updateUser,
//   deleteUser,
//   toggleActive,
//   getAllUsers,
//   getUserById,
//   exportUserDataPDF,
//   sendNotification,
//   updateMe, // ✅ Import user self-update controller
// } = require("../controllers/userController");

// // ✅ Public/Authenticated route for user self-update
// router.put("/me", protect, upload.single("avatar"), updateMe);

// // ✅ Protected Admin + Company routes
// router.use(protect, allowRoles("admin", "companyAdmin"));

// router.post("/", createUser);
// router.get("/", getAllUsers);
// router.get("/:id", getUserById);
// router.put("/:id", upload.single("avatar"), updateUser);
// // router.put("/:id", updateUser);
// router.delete("/:id", deleteUser);
// router.put("/toggle/:id", toggleActive);
// router.get("/export/:id", exportUserDataPDF);
// router.post("/notify/:id", sendNotification);

// module.exports = router;

// const express = require("express");
// const router = express.Router();
// const upload = require("../middlewares/multer");
// const { protect } = require("../middlewares/authMiddleware");
// const { allowRoles } = require("../middlewares/roleMiddleware");
// const { allowPermission } = require("../middlewares/permissionMiddleware");

// const {
//   createUser,
//   updateUser,
//   deleteUser,
//   toggleActive,
//   getAllUsers,
//   getUserById,
//   exportUserDataPDF,
//   sendNotification,
//   updateMe,
// } = require("../controllers/userController");

// // Middleware to set tenantId for company-specific routes
// const setTenantId = (req, res, next) => {
//   if (req.user.tenant) {
//     req.tenantId = req.user.tenant.toString();
//   }
//   next();
// };

// // Public/Authenticated route for user self-update
// router.put("/me", protect, upload.single("avatar"), updateMe);

// // Protected routes for admin, companyAdmin, and members with permissions
// router.use(protect, setTenantId);

// // Routes allowing admin, companyAdmin, and member with permissions
// router.post("/", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:create"), createUser);
// router.get("/", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:read"), getAllUsers);
// router.get("/:id", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:read"), getUserById);
// router.put("/:id", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:update"), upload.single("avatar"), updateUser);
// router.delete("/:id", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:delete"), deleteUser);

// // Routes restricted to admin and companyAdmin only
// router.put("/toggle/:id", allowRoles("admin", "companyAdmin"), allowPermission("user:toggle"), toggleActive);

// // Routes for admin, companyAdmin, and optionally member with permissions
// router.get("/export/:id", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:export"), exportUserDataPDF);
// router.post("/notify/:id", allowRoles("admin", "companyAdmin", "member"), allowPermission("user:notify"), sendNotification);

// module.exports = router;

// routes/userRoutes.js
// const express = require('express');
// const router = express.Router();
// const upload = require('../middlewares/multer');
// const { protect } = require('../middlewares/authMiddleware');
// const { allowRoles } = require('../middlewares/roleMiddleware');
// const { allowPermission } = require('../middlewares/permissionMiddleware');
// const {
//   createUser,
//   updateUser,
//   deleteUser,
//   toggleActive,
//   getAllUsers,
//   getUserById,
//   exportUserDataPDF,
//   sendNotification,
//   updateMe,
// } = require('../controllers/userController');

// // Middleware to set tenantId for company-specific routes
// const setTenantId = (req, res, next) => {
//   console.log('setTenantId: Processing request', {
//     url: req.originalUrl,
//     method: req.method,
//     body: req.body,
//     user: {
//       id: req.user._id,
//       role: req.user.role,
//       tenant: req.user.tenant ? req.user.tenant._id?.toString() : null,
//     },
//   });

//   if (!req.user.tenant) {
//     console.log('setTenantId: No tenant found for user', { userId: req.user._id });
//     return res.status(403).json({ message: 'Access denied: No tenant associated with this user' });
//   }

//   req.tenantId = req.user.tenant._id ? req.user.tenant._id.toString() : req.user.tenant.toString();
//   console.log('setTenantId: Set tenantId', { tenantId: req.tenantId });
//   next();
// };

// // Public/Authenticated route for user self-update
// router.put('/me', protect, upload.single('avatar'), updateMe);

// // Protected routes for admin, companyAdmin, and members with permissions
// router.use(protect, setTenantId);

// // Routes for admin and companyAdmin (no permission check)
// router.post('/', allowRoles('admin', 'companyAdmin'), createUser);

// // Route for member with permission check
// router.post('/', allowRoles('member'), allowPermission('user:create'), createUser);

// // Other routes
// router.get('/', allowRoles('admin', 'companyAdmin', 'member'), allowPermission('user:read'), getAllUsers);
// router.get('/:id', allowRoles('admin', 'companyAdmin', 'member'), allowPermission('user:read'), getUserById);
// router.put('/:id', allowRoles('admin', 'companyAdmin', 'member'), allowPermission('user:update'), upload.single('avatar'), updateUser);
// router.delete('/:id', allowRoles('admin', 'companyAdmin', 'member'), allowPermission('user:delete'), deleteUser);
// router.put('/toggle/:id', allowRoles('admin', 'companyAdmin'), allowPermission('user:toggle'), toggleActive);
// router.get('/export/:id', allowRoles('admin', 'companyAdmin', 'member'), allowPermission('user:export'), exportUserDataPDF);
// router.post('/notify/:id', allowRoles('admin', 'companyAdmin', 'member'), allowPermission('user:notify'), sendNotification);

// module.exports = router;

const express = require('express');
const router = express.Router();
const upload = require('../middlewares/multer');
const { protect } = require('../middlewares/authMiddleware');
const { allowRoles } = require('../middlewares/roleMiddleware');
const { allowPermission } = require('../middlewares/permissionMiddleware');
const {
  createUser,
  updateUser,
  deleteUser,
  toggleActive,
  getAllUsers,
  getUserById,
  exportUserDataPDF,
  sendNotification,
  updateMe,
} = require('../controllers/userController');

// Middleware to set tenantId for company-specific routes
const setTenantId = (req, res, next) => {
  if (req.user.role === 'admin') {
    return next();
  }
  
  if (!req.user.tenant) {
    // console.log('setTenantId: No tenant found for user', { userId: req.user._id });
    return res.status(403).json({ message: 'Access denied: No tenant associated with this user' });
  }

  req.tenantId = req.user.tenant._id ? req.user.tenant._id.toString() : req.user.tenant.toString();
  // console.log('setTenantId: Set tenantId', { tenantId: req.tenantId });
  next();
};

// Public/Authenticated route for user self-update
router.put('/me', protect, upload.single('avatar'), updateMe);

// Protected routes for admin, companyAdmin, and members with permissions
router.use(protect, setTenantId);

// Routes for admin and companyAdmin (no permission check)
router.post('/', allowRoles('admin', 'companyAdmin'), createUser);
router.get('/', allowRoles('admin', 'companyAdmin'), getAllUsers);
router.get('/:id', allowRoles('admin', 'companyAdmin'), getUserById);
router.put('/:id', allowRoles('admin', 'companyAdmin'), upload.single('avatar'), updateUser);
router.delete('/:id', allowRoles('admin', 'companyAdmin'), deleteUser);
router.put('/toggle/:id', allowRoles('admin', 'companyAdmin'), toggleActive);
router.get('/export/:id', allowRoles('admin', 'companyAdmin'), exportUserDataPDF);
router.post('/notify/:id', allowRoles('admin', 'companyAdmin'), sendNotification);

// Routes for member with permission check
router.post('/', allowRoles('member'), allowPermission('user:create'), createUser);
router.get('/', allowRoles('member'), allowPermission('user:read'), getAllUsers);
router.get('/:id', allowRoles('member'), allowPermission('user:read'), getUserById);
router.put('/:id', allowRoles('member'), allowPermission('user:update'), upload.single('avatar'), updateUser);
router.delete('/:id', allowRoles('member'), allowPermission('user:delete'), deleteUser);
router.get('/export/:id', allowRoles('member'), allowPermission('user:export'), exportUserDataPDF);
router.post('/notify/:id', allowRoles('member'), allowPermission('user:notify'), sendNotification);

module.exports = router;
