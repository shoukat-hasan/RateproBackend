// routes/authRoutes.js

const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");
const { protect } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimiter");

const {
  registerUser,
  resendOtp,
  verifyEmail,
  verifyEmailLink,
  forgotPassword,
  resetPassword,
  updateProfile,
  logoutUser,
  verifyResetCode,
  getMe,
  loginUser,
} = require("../controllers/authController");

// Auth routes
router.post("/register", registerUser);
router.post("/resend-otp", resendOtp);
router.post("/verify-email", verifyEmail);
router.get("/verify-email-link", verifyEmailLink);
router.post("/login", loginUser);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-code", verifyResetCode);

router.put("/update-profile", protect, upload.single("avatar"), updateProfile);
router.post("/logout", logoutUser);
router.get("/me", protect, getMe);


module.exports = router;
