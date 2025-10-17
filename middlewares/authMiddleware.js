// // middlewares/authMiddleware.js
// const jwt = require("jsonwebtoken");
// const User = require("../models/User");

// exports.protect = async (req, res, next) => {
//   try {
//     console.log("🛑 protect() triggered for:", req.originalUrl);

//     let token;

//     // Check Authorization header
//     if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
//       token = req.headers.authorization.split(' ')[1];
//       // console.log('protect: Token found in Authorization header', { token });
//     } 
//     // Fallback to cookies
//     else if (req.cookies && req.cookies.accessToken) {
//       token = req.cookies.accessToken;
//       // console.log('protect: Token found in cookies', { token });
//     } 
//     else {
//       // console.log('protect: No token found', { cookies: req.cookies, headers: req.headers });
//       return res.status(401).json({ message: 'No token provided' });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     // console.log('protect: Decoded Token', { decoded });

//     const user = await User.findById(decoded._id)
//       .select('-password')
//       .populate({
//         path: 'tenant',
//         populate: { path: 'departments', model: 'Department' },
//       })
//       .populate('customRoles');

//     if (!user) {
//       // console.log('protect: User not found', { userId: decoded._id });
//       return res.status(401).json({ message: 'User not found' });
//     }

//     req.user = user;
//     req.tenantId = user.tenant ? user.tenant._id.toString() : null;
    
//     next();
//   } catch (err) {
//     console.error('protect: Middleware error', { error: err.message, url: req.originalUrl });
//     return res.status(401).json({ message: 'Token failed or expired' });
//   }
// };
// middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ✅ Optional: Public paths ko centralize bhi kar sakte ho
const PUBLIC_PATHS = [
  "/api/surveys/public",
  "/api/auth/login",
  "/api/auth/register",
];

exports.protect = async (req, res, next) => {
  try {

    // 🟢 STEP 1: Skip public endpoints
    if (PUBLIC_PATHS.some(path => req.originalUrl.startsWith(path))) {
      return next();
    }

    let token;

    // 🟡 STEP 2: Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // 🟡 STEP 3: Cookies fallback
    else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }
    else {
      return res.status(401).json({ message: 'No token provided' });
    }

    // 🔐 STEP 4: Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🧑 STEP 5: Find user
    const user = await User.findById(decoded._id)
      .select('-password')
      .populate({
        path: 'tenant',
        populate: { path: 'departments', model: 'Department' },
      })
      .populate('customRoles');

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    req.tenantId = user.tenant ? user.tenant._id.toString() : null;

    next();
  } catch (err) {
    console.error('protect: Middleware error', { error: err.message, url: req.originalUrl });
    return res.status(401).json({ message: 'Token failed or expired' });
  }
};
