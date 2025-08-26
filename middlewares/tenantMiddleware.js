// middleware/tenantMiddleware.js
// exports.setTenantId = (req, res, next) => {
//     // console.log('setTenantId: Processing request', {
//     //   url: req.originalUrl,
//     //   method: req.method,
//     //   body: req.body,
//     //   user: {
//     //     id: req.user._id,
//     //     role: req.user.role,
//     //     tenant: req.user.tenant ? req.user.tenant._id?.toString() : null,
//     //   },
//     // });

//     if (!req.user.tenant) {
//       // console.log('setTenantId: No tenant found for user', { userId: req.user._id });
//       return res.status(403).json({ message: 'Access denied: No tenant associated with this user' });
//     }

//     req.tenantId = req.user.tenant._id ? req.user.tenant._id.toString() : req.user.tenant.toString();
//     // console.log('setTenantId: Set tenantId', { tenantId: req.tenantId });

//     // Validate tenant in payload
//     const { tenant } = req.body;
//     if (req.user.role === 'companyAdmin' && tenant && tenant !== req.tenantId) {
//       // console.log('setTenantId: Tenant mismatch', { providedTenant: tenant, userTenantId: req.tenantId });
//       return res.status(403).json({ message: 'Access denied: Invalid tenant' });
//     }

//     next();
//   };
const User = require("../models/User");

exports.setTenantId = async (req, res, next) => {
  try {
    // Ensure req.user is set by protect middleware
    if (!req.user || !req.user._id) {
      console.error('setTenantId: No user found in request');
      return res.status(401).json({ message: 'Unauthorized: No user found' });
    }

    // Get tenant from req.user.tenant (set by protect middleware)
    const user = await User.findById(req.user._id).select('tenant');
    if (!user || !user.tenant) {
      console.error('setTenantId: User has no tenant', { userId: req.user._id });
      return res.status(403).json({ message: 'Access denied: User not associated with any tenant' });
    }

    // Set tenantId in req
    req.tenantId = user.tenant.toString();
    console.log('setTenantId: Tenant ID set', { tenantId: req.tenantId, userId: req.user._id });

    // Optional: Check req.body.tenant if provided (for backward compatibility)
    const { tenant } = req.body || {};
    if (tenant && tenant !== req.tenantId) {
      console.error('setTenantId: Tenant mismatch', {
        providedTenant: tenant,
        userTenant: req.tenantId,
      });
      return res.status(403).json({ message: 'Access denied: Invalid tenant' });
    }

    next();
  } catch (err) {
    console.error('setTenantId: Error', { error: err.message });
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};