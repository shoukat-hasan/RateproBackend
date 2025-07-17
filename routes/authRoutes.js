// routes/authRoutes.js

const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");
const { protect } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimiter");

const {
  registerUser,
  loginUser,
  resendOtp,
  verifyEmail,
  verifyEmailLink,
  forgotPassword,
  resetPassword,
  updateProfile,
  logoutUser,
  verifyResetCode,
  getMe,
  updatePasswordWithOTPRequest,
} = require("../controllers/authController");

// Auth routes
router.post("/register", authLimiter, registerUser);
router.post("/resend-otp", authLimiter, resendOtp);
router.post("/verify-email", authLimiter, verifyEmail);
router.get("/verify-email-link", authLimiter, verifyEmailLink);
router.post("/login", authLimiter, loginUser);

router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/request-password-update", protect, updatePasswordWithOTPRequest);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/verify-reset-code", verifyResetCode);

router.put("/update-profile", protect, upload.single("avatar"), updateProfile);
router.post("/logout", logoutUser);
router.get("/me", protect, getMe);


module.exports = router;
