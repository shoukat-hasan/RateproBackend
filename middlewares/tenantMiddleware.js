// middleware/tenantMiddleware.js
exports.setTenantId = (req, res, next) => {
    // console.log('setTenantId: Processing request', {
    //   url: req.originalUrl,
    //   method: req.method,
    //   body: req.body,
    //   user: {
    //     id: req.user._id,
    //     role: req.user.role,
    //     tenant: req.user.tenant ? req.user.tenant._id?.toString() : null,
    //   },
    // });
  
    if (!req.user.tenant) {
      // console.log('setTenantId: No tenant found for user', { userId: req.user._id });
      return res.status(403).json({ message: 'Access denied: No tenant associated with this user' });
    }
  
    req.tenantId = req.user.tenant._id ? req.user.tenant._id.toString() : req.user.tenant.toString();
    // console.log('setTenantId: Set tenantId', { tenantId: req.tenantId });
  
    // Validate tenant in payload
    const { tenant } = req.body;
    if (req.user.role === 'companyAdmin' && tenant && tenant !== req.tenantId) {
      // console.log('setTenantId: Tenant mismatch', { providedTenant: tenant, userTenantId: req.tenantId });
      return res.status(403).json({ message: 'Access denied: Invalid tenant' });
    }
  
    next();
  };