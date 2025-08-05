// // middlewares/authMiddleware.js

// const jwt = require("jsonwebtoken");
// const User = require("../models/User");

// exports.protect = async (req, res, next) => {
//   let token;

//   // From headers or cookie
//   if (req.headers.authorization?.startsWith("Bearer")) {
//     token = req.headers.authorization.split(" ")[1];
//   } else if (req.cookies?.refreshToken) {
//     token = req.cookies.refreshToken;
//   }

//   if (!token) return res.status(401).json({ message: "Not authorized, token missing" });

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET || process.env.REFRESH_TOKEN_SECRET);
//     req.user = await User.findById(decoded.id).select("-password");
//     if (!req.user) throw new Error("User not found");
//     next();
//   } catch (err) {
//     console.error(err);
//     res.status(401).json({ message: "Token failed or expired" });
//   }
// };
// middlewares/authMiddleware.js
// const jwt = require("jsonwebtoken");
// const User = require("../models/User");

// exports.protect = async (req, res, next) => {
//   let token, tokenType;

//   if (req.headers.authorization?.startsWith("Bearer")) {
//     token = req.headers.authorization.split(" ")[1];
//     tokenType = "access";
//   } else if (req.cookies?.accessToken) {
//     token = req.cookies.accessToken;
//     tokenType = "access"; // still verify with JWT_SECRET
//   }

//   if (!token) return res.status(401).json({ message: "Not authorized, token missing" });

//   try {
//     const secret =
//       tokenType === "access"
//         ? process.env.ACCESS_TOKEN_SECRET
//         : process.env.REFRESH_TOKEN_SECRET;

//     const decoded = jwt.verify(token, secret);
//     console.log("✅ Token decoded:", decoded);
//     const user = await User.findById(decoded.id || decoded._id);
//     console.log("👤 User from DB:", user);
//     req.user = await User.findById(decoded.id).select("-password");

//     if (!req.user) throw new Error("User not found");

//     next();
//   } catch (err) {
//     console.error(err);
//     return res.status(401).json({ message: "Token failed or expired" });
//   }
// };

const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  let token;

  // ✅ 1. Check for token in Authorization header OR cookies
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, token missing" });
  }

  try {
    // ✅ 2. Always use ACCESS_TOKEN_SECRET to verify
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    console.log("✅ Token decoded:", decoded);

    // ✅ 3. Make sure to access `decoded._id` (NOT `decoded.id`)
    const user = await User.findById(decoded._id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    console.log("👤 User from DB:", user);

    // ✅ 4. Attach user to request
    req.user = user;

    next();
  } catch (err) {
    console.error("🔒 Auth error:", err.message);
    return res.status(401).json({ message: "Token failed or expired" });
  }
};
