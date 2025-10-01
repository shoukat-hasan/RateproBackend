// routes/roleRoutes.js
// const express = require("express");
// const router = express.Router();
// const { protect } = require("../middlewares/authMiddleware");
// const { allowRoles } = require("../middlewares/roleMiddleware");
// const roleController = require("../controllers/roleController");

// // protect all role routes (admin + company)
// router.use(protect);

// // create & list roles (admin & company)
// router.post("/", allowRoles("admin", "companyAdmin"), roleController.createRole);
// router.get("/", allowRoles("admin", "companyAdmin"), roleController.getRoles);

// // assign/remove role (admin & company)
// router.post("/assign/:userId", allowRoles("admin", "companyAdmin"), roleController.assignRoleToUser);
// router.post("/remove/:userId", allowRoles("admin", "companyAdmin"), roleController.removeRoleFromUser);

// module.exports = router;
// routes/roleRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const {
  createRole,
  getRoles,
  assignRoleToUser,
  removeRoleFromUser,
  updateRole,
  deleteRole,
  getUsersByRole,
} = require("../controllers/roleController");

// Role management (admin and companyAdmin only)
router.post("/", protect, allowRoles("companyAdmin"), createRole);
router.get("/", protect, allowRoles("companyAdmin"), getRoles);
router.post("/assign/:userId", protect, allowRoles("companyAdmin"), assignRoleToUser);
router.post("/remove/:userId", protect, allowRoles("companyAdmin"), removeRoleFromUser);
router.put("/:roleId", protect, allowRoles("companyAdmin"), updateRole);
router.delete("/:roleId", protect, allowRoles("companyAdmin"), deleteRole);

router.get("/:roleId/users", protect, allowRoles("companyAdmin"), getUsersByRole);

module.exports = router;