// middlewares/rateLimiter.js

const rateLimit = require("express-rate-limit");

exports.globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100, // max 100 requests/IP per 15 mins
  message: {
    status: 429,
    message: "Too many requests from this IP. Please try again later.",
  },
});

exports.authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 min
  max: 5, // max 5 OTP/logins/regs per IP
  message: {
    status: 429,
    message: "Too many auth attempts. Please wait and try again.",
  },
});
