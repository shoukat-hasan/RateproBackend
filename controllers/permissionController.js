// permissionController.js
const Permission = require('../models/Permission');

exports.getPermissions = async (req, res, next) => {
    try {
      const permissions = await Permission.find().select('_id name description group');
      if (!permissions || permissions.length === 0) {
        return res.status(404).json({ message: "No permissions found" });
      }
      res.status(200).json({ permissions });
    } catch (err) {
      console.error("Error getting permissions:", err);
      res.status(500).json({ message: "Failed to fetch permissions", error: err.message });
    }
  };