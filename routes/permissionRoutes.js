// routes/permissionRoutes.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middlewares/authMiddleware");
const { allowRoles } = require("../middlewares/roleMiddleware");
const Permission = require("../models/Permission");

// Get all permissions
router.get("/", protect, allowRoles("companyAdmin"), async (req, res) => {
  try {
    const permissions = await Permission.find().select('_id name description group');
    if (!permissions || permissions.length === 0) {
      return res.status(404).json({ message: "No permissions found" });
    }
    res.status(200).json({ permissions });
  } catch (err) {
    console.error("Error fetching permissions:", err);
    res.status(500).json({ message: "Failed to fetch permissions", error: err.message });
  }
});

module.exports = router;