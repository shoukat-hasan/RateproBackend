// controllers/permissionController.js
const Permission = require('../models/Permission');
const Logger = require("../utils/auditLog");

// GET: Get all permissions
exports.getPermissions = async (req, res, next) => {
  try {
    const permissions = await Permission.find().select('_id name description group');

    if (!permissions || permissions.length === 0) {
      await Logger.warn('getPermissions', 'No permissions found', {
        triggeredBy: req.user?.email,
        tenantId: req.tenantId,
        statusCode: 404,
      });
      return res.status(404).json({ message: "No permissions found" });
    }

    await Logger.info('getPermissions', 'Permissions fetched successfully', {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      totalPermissions: permissions.length,
      statusCode: 200,
    });

    res.status(200).json({ permissions });
  } catch (err) {
    console.error("Error getting permissions:", err);

    await Logger.error('getPermissions', 'Error fetching permissions', {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      message: err.message,
      stack: err.stack,
    });

    res.status(500).json({ message: "Failed to fetch permissions", error: err.message });
  }
};
