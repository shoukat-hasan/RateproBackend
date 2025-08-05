// utils/generateToken.js

// const jwt = require("jsonwebtoken");

// const generateToken = (userId, type = "access") => {
//   const secret =
//     type === "access"
//       ? process.env.JWT_SECRET
//       : process.env.REFRESH_TOKEN_SECRET;

//   const expiresIn =
//     type === "access"
//       ? process.env.JWT_EXPIRE || "30d"
//       : "30d";

//   return jwt.sign({ id: userId }, secret, { expiresIn });
// };

// module.exports = generateToken;

const jwt = require("jsonwebtoken");

const generateToken = (userId, type = "access") => {
  const secret =
    type === "access"
      ? process.env.ACCESS_TOKEN_SECRET  // ✅ Now correctly using access secret
      : process.env.REFRESH_TOKEN_SECRET;

  const expiresIn =
    type === "access"
      ? process.env.JWT_EXPIRE || "30m"
      : "30d";

  return jwt.sign({ _id: userId }, secret, { expiresIn });
};

module.exports = generateToken;

