// routes/authRoutes.js

const express = require("express");
const router = express.Router();
const upload = require("../middlewares/multer");
const { protect } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimiter");
const passport = require("passport");

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
  verifyLoginOTP,
  refreshAccessToken,
} = require("../controllers/authController");

// Auth routes
router.post("/register", registerUser);
router.post("/resend-otp", resendOtp);
router.post("/verify-email", verifyEmail);
router.get("/verify-email-link", verifyEmailLink);
router.post("/login", loginUser);
router.post("/verify-login-otp", verifyLoginOTP);
router.get("/refresh-token", refreshAccessToken);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-reset-code", verifyResetCode);

router.put("/update-profile", protect, upload.single("avatar"), updateProfile);
router.post("/logout", logoutUser);
router.get("/me", protect, getMe);

// Google OAuth
// router.get("/google", googleAuthStart); 
// // router.get("/google/callback", googleAuthCallback);
// router.get(
//   "/google/callback",
//   passport.authenticate("google", { failureRedirect: process.env.FRONTEND_URL + "/auth/failure" }),
//   authController.loginWithGoogle
// );


module.exports = router;
