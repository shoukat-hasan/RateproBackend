// middlewares/roleMiddleware.js

// exports.allowRoles = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({ message: "Access denied for your role" });
//     }

//     if (!req.user || !req.user.role) {
//       return res.status(401).json({ message: "Not authenticated" });
//     }
//     next();
//   };
// };

exports.allowRoles = (...roles) => (req, res, next) => {
  // console.log('allowRoles: Checking role', {
  //   userRole: req.user.role,
  //   allowedRoles: roles,
  //   userId: req.user._id,
  // });

  if (!roles.includes(req.user.role)) {
    // console.log('allowRoles: Role not allowed', { userRole: req.user.role, allowedRoles: roles });
    return res.status(403).json({ message: 'Access denied: Role not authorized' });
  }

  // console.log('allowRoles: Role allowed', { userRole: req.user.role });
  next();
};