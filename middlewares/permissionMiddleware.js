// middlewares/permissionMiddleware.js
const User = require("../models/User");
const CustomRole = require("../models/CustomRole");

// exports.allowPermission = (permission) => async (req, res, next) => {
//   try {
//     console.log('allowPermission: Checking permission', {
//       permission,
//       userId: req.user._id,
//       role: req.user.role,
//       tenant: req.user.tenant ? req.user.tenant._id?.toString() : null,
//     });

//     const user = await User.findById(req.user._id).populate({
//       path: 'customRoles',
//       match: { isActive: true, deleted: false },
//       populate: { path: 'permissions', select: 'name' },
//     });

//     const hasPermission = user.customRoles?.some((role) =>
//       role.permissions.some((perm) => perm.name === permission)
//     );

//     console.log('allowPermission: Permission check result', { hasPermission, permission });

//     if (!hasPermission) {
//       console.log('allowPermission: Permission denied', { userId: req.user._id, permission });
//       return res.status(403).json({ message: 'Permission denied: Insufficient permissions' });
//     }

//     // Check for outdated tenant validation
//     const { tenant, company } = req.body;
//     if (req.user.role === 'companyAdmin' && company) {
//       console.log('allowPermission: Found deprecated company field', { company });
//       return res.status(400).json({ message: 'Deprecated field: Use tenant instead of company' });
//     }

//     if (req.user.role === 'companyAdmin' && tenant && tenant !== req.user.tenant._id?.toString()) {
//       console.log('allowPermission: Tenant mismatch', {
//         providedTenant: tenant,
//         userTenantId: req.user.tenant._id?.toString(),
//       });
//       return res.status(403).json({ message: 'Access denied: Invalid tenant' });
//     }

//     console.log('allowPermission: Permission granted', { userId: req.user._id, permission });
//     next();
//   } catch (err) {
//     console.error('allowPermission: Error', { error: err.message });
//     return res.status(500).json({ message: 'Internal Server Error' });
//   }
// };

// middlewares/permissionMiddleware.js
const PermissionAssignment = require('../models/PermissionAssignment');
const Permission = require('../models/Permission');

exports.allowPermission = (permission) => async (req, res, next) => {
  try {
    console.log('allowPermission: Checking permission', {
      permission,
      userId: req.user._id,
      role: req.user.role,
      tenant: req.user.tenant ? req.user.tenant._id?.toString() : null,
    });

    // Fetch user with populated customRoles
    const user = await User.findById(req.user._id).populate({
      path: 'customRoles',
      match: { isActive: true, deleted: false },
      populate: { path: 'permissions', select: 'name' },
    });

    // Check permission in customRoles
    const hasRolePermission = user.customRoles?.some((role) =>
      role.permissions.some((perm) => perm.name === permission)
    );

    // Check permission in PermissionAssignment
    const permissionDoc = await Permission.findOne({ name: permission });
    if (!permissionDoc) {
      console.log('allowPermission: Permission not found', { permission });
      return res.status(404).json({ message: 'Permission not found' });
    }

    const hasDirectPermission = await PermissionAssignment.findOne({
      userId: req.user._id,
      permissionId: permissionDoc._id,
      tenantId: req.user.tenant?._id,
    });

    const hasPermission = hasRolePermission || !!hasDirectPermission;

    console.log('allowPermission: Permission check result', {
      hasPermission,
      hasRolePermission,
      hasDirectPermission: !!hasDirectPermission,
      permission,
    });

    if (!hasPermission) {
      console.log('allowPermission: Permission denied', { userId: req.user._id, permission });
      return res.status(403).json({ message: 'Permission denied: Insufficient permissions' });
    }

    // Tenant validation (same as original)
    const { tenant, company } = req.body;
    if (req.user.role === 'companyAdmin' && company) {
      console.log('allowPermission: Found deprecated company field', { company });
      return res.status(400).json({ message: 'Deprecated field: Use tenant instead of company' });
    }

    if (req.user.role === 'companyAdmin' && tenant && tenant !== req.user.tenant._id?.toString()) {
      console.log('allowPermission: Tenant mismatch', {
        providedTenant: tenant,
        userTenantId: req.user.tenant._id?.toString(),
      });
      return res.status(403).json({ message: 'Access denied: Invalid tenant' });
    }

    console.log('allowPermission: Permission granted', { userId: req.user._id, permission });
    next();
  } catch (err) {
    console.error('allowPermission: Error', { error: err.message });
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};