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
const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.protect = async (req, res, next) => {
  let token, tokenType;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
    tokenType = "access";
  } else if (req.cookies?.token) {
    token = req.cookies.token;
    tokenType = "access"; // still verify with JWT_SECRET
  } 

  if (!token) return res.status(401).json({ message: "Not authorized, token missing" });

  try {
    const secret =
      tokenType === "access"
        ? process.env.JWT_SECRET
        : process.env.REFRESH_TOKEN_SECRET;

    const decoded = jwt.verify(token, secret);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) throw new Error("User not found");

    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Token failed or expired" });
  }
};
