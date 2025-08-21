// middlewares/permissionMiddleware.js
// const User = require("../models/User");
// const Role = require("../models/CustomRole");

// exports.allowPermission = (permissionKey) => {
//   return async (req, res, next) => {
//     try {
//       if (!req.user) return res.status(401).json({ message: "Not authenticated" });

//       // Super admin bypass
//       if (req.user.role === "admin") return next();

//       // Load user's roles with permissions
//       const user = await User.findById(req.user._id).populate("customRoles");
//       if (!user) return res.status(401).json({ message: "User not found" });

//       const roles = user.customRoles || [];
//       const hasPermission = roles.some(r => Array.isArray(r.permissions) && r.permissions.includes(permissionKey));

//       if (!hasPermission) return res.status(403).json({ message: "Permission denied" });
//       next();
//     } catch (err) {
//       next(err);
//     }
//   };
// };
const User = require("../models/User");
const CustomRole = require("../models/CustomRole");

// exports.allowPermission = (permissionKey) => {
//   return async (req, res, next) => {
//     try {
//       // Check if user is authenticated
//       if (!req.user || !req.user._id) {
//         return res.status(401).json({ message: "Not authenticated" });
//       }

//       // Super admin bypass
//       if (req.user.role === "admin") {
//         return next();
//       }

//       // Load user's custom roles with permissions
//       const user = await User.findById(req.user._id).populate({
//         path: "customRoles",
//         match: { isActive: true, deleted: false }, // Only active roles
//         populate: {
//           path: "permissions",
//           select: "name"
//         }
//       });

//       if (!user) {
//         return res.status(401).json({ message: "User not found" });
//       }

//       // Check tenant scope (for companyAdmin and members)
//       if (user.tenant && req.tenantId && user.tenant.toString() !== req.tenantId) {
//         return res.status(403).json({ message: "Access denied: Wrong company" });
//       }

//       // Check if user has the required permission
//       const customRoles = user.customRoles || [];
//       const hasPermission = customRoles.some(role =>
//         role.permissions.some(perm => perm.name === permissionKey)
//       );

//       if (!hasPermission) {
//         return res.status(403).json({ message: "Permission denied" });
//       }

//       next();
//     } catch (err) {
//       console.error("Permission middleware error:", err);
//       next(err);
//     }
//   };
// };

exports.allowPermission = (permission) => async (req, res, next) => {
  try {
    console.log('allowPermission: Checking permission', {
      permission,
      userId: req.user._id,
      role: req.user.role,
      tenant: req.user.tenant ? req.user.tenant._id?.toString() : null,
    });

    const user = await User.findById(req.user._id).populate({
      path: 'customRoles',
      match: { isActive: true, deleted: false },
      populate: { path: 'permissions', select: 'name' },
    });

    const hasPermission = user.customRoles?.some((role) =>
      role.permissions.some((perm) => perm.name === permission)
    );

    console.log('allowPermission: Permission check result', { hasPermission, permission });

    if (!hasPermission) {
      console.log('allowPermission: Permission denied', { userId: req.user._id, permission });
      return res.status(403).json({ message: 'Permission denied: Insufficient permissions' });
    }

    // Check for outdated tenant validation
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