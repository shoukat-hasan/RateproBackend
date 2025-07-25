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
// } = require("../controllers/userController");

// // Admin + Company Roles
// router.use(protect, allowRoles("admin", "company"));

// router.post("/", createUser);
// router.get("/", getAllUsers);
// router.get("/:id", getUserById);
// router.put("/:id", upload.single("avatar"), updateUser);
// router.delete("/:id", deleteUser);
// router.put("/toggle/:id", toggleActive);
// router.get("/export/:id", exportUserDataPDF);
// router.post("/notify/:id", sendNotification);

// module.exports = router;
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");

const {
  createUser,
  updateUser,
  deleteUser,
  toggleActive,
  getAllUsers,
  getUserById,
  exportUserDataPDF,
  sendNotification,
  updateMe, // ✅ Import user self-update controller
} = require("../controllers/userController");

// ✅ Public/Authenticated route for user self-update
router.put("/me", protect, upload.single("avatar"), updateMe);

// ✅ Protected Admin + Company routes
router.use(protect, allowRoles("admin", "company"));

router.post("/", createUser);
router.get("/", getAllUsers);
router.get("/:id", getUserById);
router.put("/:id", upload.single("avatar"), updateUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.put("/toggle/:id", toggleActive);
router.get("/export/:id", exportUserDataPDF);
router.post("/notify/:id", sendNotification);

module.exports = router;
