// // /controllers/authController.js
// const User = require("../models/User");
// const OTP = require("../models/OTP");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const Joi = require("joi");
// const sendEmail = require("../utils/sendEmail");
// const generateToken = require("../utils/generateToken");
// const cloudinary = require("../utils/cloudinary");
// const moment = require("moment");
// const getBaseURL = require("../utils/getBaseURL");

// // Helper: Generate OTP Code
// const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// // Validation Schemas
// const registerSchema = Joi.object({
//     name: Joi.string().min(2).max(50).required().messages({
//         "string.min": "Name must be at least 2 characters",
//         "string.max": "Name cannot exceed 50 characters",
//         "any.required": "Name is required",
//     }),
//     email: Joi.string().email().required().messages({
//         "string.email": "Invalid email format",
//         "any.required": "Email is required",
//     }),
//     password: Joi.string().min(6).required().messages({
//         "string.min": "Password must be at least 6 characters",
//         "any.required": "Password is required",
//     }),
// });

// const loginSchema = Joi.object({
//     email: Joi.string().email().required().messages({
//         "string.email": "Invalid email format",
//         "any.required": "Email is required",
//     }),
//     password: Joi.string().required().messages({
//         "any.required": "Password is required",
//     }),
//     source: Joi.string().optional(),
// });

// const verifyEmailSchema = Joi.object({
//     email: Joi.string().email().required(),
//     code: Joi.string().length(6).required(),
// });

// const resendOtpSchema = Joi.object({
//     email: Joi.string().email().required(),
//     purpose: Joi.string().valid("verify", "reset").required(),
//     source: Joi.string().optional(),
// });

// const forgotPasswordSchema = Joi.object({
//     email: Joi.string().email().required(),
// });

// const verifyResetCodeSchema = Joi.object({
//     email: Joi.string().email().required(),
//     code: Joi.string().length(6).required(),
// });

// const resetPasswordSchema = Joi.object({
//     email: Joi.string().email().required(),
//     code: Joi.string().length(6).required(),
//     newPassword: Joi.string().min(6).required(),
// });

// const updateProfileSchema = Joi.object({
//     name: Joi.string().min(2).max(50).optional(),
//     phone: Joi.string().pattern(/^\+?\d{10,15}$/).allow("").optional(), // Allow phone with validation
//     bio: Joi.string().max(500).allow("").optional(), // Allow bio with max length
//     currentPassword: Joi.string().optional(),
//     newPassword: Joi.string().min(6).optional(),
// }).with("newPassword", "currentPassword");

// exports.registerUser = async (req, res, next) => {
//     try {
//         // Validate input
//         const { error } = registerSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { name, email, password } = req.body;

//         // Check existing user
//         const userExists = await User.findOne({ email });
//         if (userExists) return res.status(400).json({ message: "Email already registered" });

//         // Hash password
//         const hashedPassword = await bcrypt.hash(password, 12);

//         // Generate OTP
//         const otpCode = generateOTP();
//         const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

//         // Create user
//         const user = await User.create({
//             name,
//             email,
//             password: hashedPassword,
//             role: "user",
//             authProvider: "local",
//             tenant: null,
//             createdBy: null,
//             isVerified: false,
//         });

//         // Save OTP
//         await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

//         // Send verification email
//         const baseURL = getBaseURL().public;
//         const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;
//         try {
//             // 📧 SEND EMAIL USING TEMPLATE SYSTEM
//             await sendEmail({
//                 to: email,
//                 templateType: "user_registration", // Database template type
//                 templateData: {
//                     userName: name,
//                     userEmail: email,
//                     verificationLink: verificationLink,
//                     expiryMinutes: process.env.OTP_EXPIRE_MINUTES || 15,
//                     companyName: "RatePro"
//                 }
//             });

//             await createLog(user._id, 'USER_REGISTRATION', `User registered successfully with template email: ${email}`, 'success', req.ip, req.get('User-Agent'));

//         } catch (templateError) {
//             // Fallback to basic email if template fails
//             await createLog(user._id, 'USER_REGISTRATION', `Template email failed, using fallback: ${templateError.message}`, 'warning', req.ip, req.get('User-Agent'));

//             await sendEmail({
//                 to: email,
//                 subject: "Verify Your Email - RatePro",
//                 html: `
//                     <p>Hello ${name || "user"},</p>
//                     <p>Click this link to verify your email: <a href="${verificationLink}">${verificationLink}</a></p>
//                     <p>This link expires in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
//                     <br/>
//                     <p>Regards,<br/>Team RatePro</p>
//                 `,
//             });
//         }

//         res.status(201).json({ message: "User registered. Verification link sent to email." });
//     } catch (err) {
//         next(err);
//     }
// };

// exports.verifyEmailLink = async (req, res, next) => {
//     try {
//         const { code, email } = req.query;

//         // Validate query
//         const { error } = verifyEmailSchema.validate({ code, email });
//         if (error) return res.redirect(`${process.env.RATEPRO_URL}/login?message=invalid-otp`);

//         const otp = await OTP.findOne({ email, code, purpose: "verify" });
//         if (!otp) return res.redirect(`${process.env.RATEPRO_URL}/login?message=invalid-otp`);

//         if (otp.expiresAt < new Date()) {
//             return res.redirect(`${process.env.RATEPRO_URL}/login?message=otp-expired`);
//         }

//         const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
//         if (!user) return res.redirect(`${process.env.RATEPRO_URL}/login?message=user-not-found`);

//         const baseURL = user.role === "admin" || user.role === "companyAdmin"
//             ? process.env.FRONTEND_URL
//             : process.env.RATEPRO_URL;

//         await OTP.deleteMany({ email, purpose: "verify" });

//         // Generate tokens
//         const accessToken = generateToken({ id: user._id, role: user.role, tenant: user.tenant, customRoles: user.customRoles }, "access");
//         const refreshToken = generateToken({ id: user._id, role: user.role, tenant: user.tenant, customRoles: user.customRoles }, "refresh");

//         // Set cookies
//         res.cookie("refreshToken", refreshToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
//             maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
//         });

//         res.cookie("accessToken", accessToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
//             maxAge: 1 * 60 * 60 * 1000, // 1 hour
//         });

//         return res.redirect(`${baseURL}/app`);
//     } catch (err) {
//         console.error("Verify email link error:", err);
//         return res.redirect(`${process.env.RATEPRO_URL}/login?message=error`);
//     }
// };

// exports.verifyEmail = async (req, res, next) => {
//     try {
//         const { error } = verifyEmailSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { email, code } = req.body;

//         const otp = await OTP.findOne({ email, code, purpose: "verify" });
//         if (!otp) return res.status(400).json({ message: "Invalid OTP" });

//         if (otp.expiresAt < new Date()) {
//             return res.status(400).json({ message: "OTP expired. Request a new one." });
//         }

//         await User.findOneAndUpdate({ email }, { isVerified: true });
//         await OTP.deleteMany({ email, purpose: "verify" });

//         res.status(200).json({ message: "Email verified successfully" });
//     } catch (err) {
//         next(err);
//     }
// };

// exports.resendOtp = async (req, res, next) => {
//     try {
//         const { error } = resendOtpSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { email, purpose } = req.body;

//         const user = await User.findOne({ email });
//         if (!user) return res.status(404).json({ message: "User not found" });

//         await OTP.deleteMany({ email, purpose });

//         const otpCode = generateOTP();
//         const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

//         await OTP.create({ email, code: otpCode, expiresAt, purpose });

//         const baseURL = user.role === "admin" || user.role === "companyAdmin"
//             ? process.env.FRONTEND_URL
//             : process.env.RATEPRO_URL;

//         // 📧 SEND EMAIL USING TEMPLATE SYSTEM
//         try {
//             if (purpose === "verify") {
//                 await sendEmail({
//                     to: email,
//                     templateType: "user_registration", // Same template as registration
//                     templateData: {
//                         userName: user.name,
//                         userEmail: email,
//                         verificationLink: verificationLink,
//                         expiryMinutes: process.env.OTP_EXPIRE_MINUTES || 15,
//                         companyName: "RatePro"
//                     }
//                 });
//             } else {
//                 // For reset password OTP
//                 await sendEmail({
//                     to: email,
//                     templateType: "password_reset",
//                     templateData: {
//                         userName: user.name,
//                         userEmail: email,
//                         resetCode: otpCode,
//                         expiryMinutes: process.env.OTP_EXPIRE_MINUTES || 15,
//                         companyName: "RatePro"
//                     }
//                 });
//             }

//             await createLog(user._id, 'RESEND_OTP', `OTP resent for ${purpose} using template: ${email}`, 'success', req.ip, req.get('User-Agent'));

//         } catch (templateError) {
//             // Fallback to basic email if template fails
//             await createLog(user._id, 'RESEND_OTP', `Template email failed, using fallback: ${templateError.message}`, 'warning', req.ip, req.get('User-Agent'));

//             const emailContent = {
//                 to: email,
//                 subject: purpose === "verify" ? "Verify Your Email" : `OTP Code for ${purpose}`,
//                 html: purpose === "verify"
//                     ? `<p>Your new verification code: <b>${otpCode}</b></p><p>Click: <a href="${verificationLink}">${verificationLink}</a></p>`
//                     : `<p>Your OTP Code: ${otpCode}</p>`,
//             };

//             await sendEmail(emailContent);
//         }


//         res.status(200).json({ message: "OTP resent to email" });
//     } catch (err) {
//         next(err);
//     }
// };

// exports.loginUser = async (req, res, next) => {
//     try {
//         const { error } = loginSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { email, password } = req.body;

//         // === find user with nested populate ===
//         const user = await User.findOne({ email })
//             .select("+password")
//             .populate([
//                 { path: "tenant", select: "name domain isActive createdAt" },
//                 {
//                     path: "customRoles",
//                     select: "name permissions createdAt",
//                     populate: {
//                         path: "permissions",
//                         model: "Permission",
//                         select: "name description group createdAt" // <-- full permission detail
//                     }
//                 }
//             ]);

//         if (!user) return res.status(404).json({ message: "User not found" });

//         // === check password ===
//         const isMatch = await bcrypt.compare(password, user.password);
//         if (!isMatch) return res.status(401).json({ message: "Invalid password" });

//         // === verify email check ===
//         if (!user.isVerified) {
//             await OTP.deleteMany({ email, purpose: "verify" });

//             const otpCode = generateOTP();
//             const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();
//             await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

//             const baseURL =
//                 ["admin", "companyAdmin", "member"].includes(user.role)
//                     ? process.env.FRONTEND_URL
//                     : process.env.RATEPRO_URL;

//             const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;

//             // 📧 SEND EMAIL USING TEMPLATE SYSTEM
//             try {
//                 await sendEmail({
//                     to: email,
//                     templateType: "user_registration",
//                     templateData: {
//                         userName: user.name,
//                         userEmail: email,
//                         verificationLink: verificationLink,
//                         expiryMinutes: process.env.OTP_EXPIRE_MINUTES || 15,
//                         companyName: "RatePro"
//                     }
//                 });

//                 await createLog(user._id, 'USER_LOGIN', `Verification email sent using template for unverified user: ${email}`, 'warning', req.ip, req.get('User-Agent'));

//             } catch (templateError) {
//                 // Fallback to basic email if template fails
//                 await createLog(user._id, 'USER_LOGIN', `Template email failed, using fallback: ${templateError.message}`, 'warning', req.ip, req.get('User-Agent'));

//                 await sendEmail({
//                     to: email,
//                     subject: "Verify Your Email",
//                     html: `
//                       <p>Hello ${user.name},</p>
//                       <p>Please verify your email before logging in.</p>
//                       <p>Click: <a href="${verificationLink}">${verificationLink}</a></p>
//                       <p>This link expires in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
//                     `,
//                 });
//             }

//             return res.status(401).json({
//                 message: "Email not verified. A verification link has been sent to your email.",
//             });
//         }

//         // === generate tokens ===
//         const accessToken = generateToken(
//             {
//                 _id: user._id.toString(),
//                 role: user.role,
//                 tenant: user.tenant ? user.tenant._id.toString() : null,
//                 customRoles: user.customRoles.map(r => r._id.toString())
//             },
//             "access"
//         );

//         const refreshToken = generateToken(
//             {
//                 _id: user._id.toString(),
//                 role: user.role,
//             },
//             "refresh"
//         );

//         // === set cookies ===
//         res.cookie("refreshToken", refreshToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
//             maxAge: 7 * 24 * 60 * 60 * 1000,
//         });

//         res.cookie("accessToken", accessToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
//             maxAge: 30 * 60 * 60 * 1000,
//         });

//         user.lastLogin = Date.now();
//         await user.save();

//         // === safeUser with fully populated data ===
//         const safeUser = {
//             _id: user._id,
//             name: user.name,
//             email: user.email,
//             role: user.role,
//             customRoles: user.customRoles, // now includes full permissions[]
//             authProvider: user.authProvider,
//             bio: user.bio,
//             phone: user.phone,
//             isActive: user.isActive,
//             isVerified: user.isVerified,
//             surveyStats: user.surveyStats,
//             tenant: user.tenant, // populated object {name, domain, ...}
//             createdAt: user.createdAt,
//             updatedAt: user.updatedAt,
//             companyProfileUpdated: user.companyProfileUpdated,
//             lastLogin: user.lastLogin,
//         };

//         res.status(200).json({
//             accessToken,
//             user: safeUser,
//         });
//     } catch (err) {
//         console.error("❌ Login Error:", err);
//         next(err);
//     }
// };

// exports.forgotPassword = async (req, res, next) => {
//     try {
//         const { error } = forgotPasswordSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { email } = req.body;

//         const user = await User.findOne({ email });
//         if (!user) return res.status(404).json({ message: "No user with this email" });

//         const otpCode = generateOTP();
//         const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

//         await OTP.deleteMany({ email, purpose: "reset" });
//         await OTP.create({ email, code: otpCode, expiresAt, purpose: "reset" });

//         // 📧 SEND EMAIL USING TEMPLATE SYSTEM
//         try {
//             await sendEmail({
//                 to: email,
//                 templateType: "password_reset",
//                 templateData: {
//                     userName: user.name,
//                     userEmail: email,
//                     resetCode: otpCode,
//                     expiryMinutes: process.env.OTP_EXPIRE_MINUTES || 15,
//                     companyName: "RatePro"
//                 }
//             });

//             await createLog(user._id, 'FORGOT_PASSWORD', `Password reset OTP sent using template: ${email}`, 'success', req.ip, req.get('User-Agent'));

//         } catch (templateError) {
//             // Fallback to basic email if template fails
//             await createLog(user._id, 'FORGOT_PASSWORD', `Template email failed, using fallback: ${templateError.message}`, 'warning', req.ip, req.get('User-Agent'));

//             await sendEmail({
//                 to: email,
//                 subject: "Reset Password OTP",
//                 html: `<p>Your OTP Code to reset password: <b>${otpCode}</b></p>`,
//             });
//         }

//         res.status(200).json({ message: "OTP sent for password reset" });
//     } catch (err) {
//         console.error("Forgot password error:", err);
//         next(err);
//     }
// };

// exports.verifyResetCode = async (req, res) => {
//     try {
//         const { error } = verifyResetCodeSchema.validate(req.body, { allowUnknown: true });
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { email, code } = req.body;

//         const otpRecord = await OTP.findOne({
//             email,
//             code,
//             purpose: "reset",
//             expiresAt: { $gt: new Date() },
//         });

//         if (!otpRecord) return res.status(400).json({ message: "Invalid or expired code" });

//         res.status(200).json({ message: "OTP verified. You can reset your password now." });
//     } catch (err) {
//         console.error("Verify reset code error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// exports.resetPassword = async (req, res, next) => {
//     try {
//         const { error } = resetPasswordSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const { email, code, newPassword } = req.body;

//         const otp = await OTP.findOne({ email, code, purpose: "reset" });
//         if (!otp) return res.status(400).json({ message: "Invalid OTP" });

//         if (otp.expiresAt < new Date()) {
//             return res.status(400).json({ message: "OTP expired" });
//         }

//         const hashed = await bcrypt.hash(newPassword, 12);
//         await User.findOneAndUpdate({ email }, { password: hashed });
//         await OTP.deleteMany({ email, purpose: "reset" });

//         res.status(200).json({ message: "Password reset successful" });
//     } catch (err) {
//         console.error("Reset password error:", err);
//         next(err);
//     }
// };

// exports.updateProfile = async (req, res, next) => {
//     try {
//         const { error } = updateProfileSchema.validate(req.body);
//         if (error) return res.status(400).json({ message: error.details[0].message });

//         const user = await User.findById(req.user._id);
//         if (!user) return res.status(404).json({ message: "User not found" });

//         const { name, currentPassword, newPassword } = req.body;

//         // Update avatar
//         if (req.file) {
//             if (user.avatar?.public_id) await cloudinary.uploader.destroy(user.avatar.public_id);
//             const result = await cloudinary.uploader.upload(req.file.path, { folder: "avatars" });
//             user.avatar = { public_id: result.public_id, url: result.secure_url };
//         }

//         // Update name
//         if (name) user.name = name;

//         // Update password
//         if (currentPassword && newPassword) {
//             const match = await bcrypt.compare(currentPassword, user.password);
//             if (!match) return res.status(400).json({ message: "Current password incorrect" });
//             user.password = await bcrypt.hash(newPassword, 12);
//         }

//         // Restrict sensitive fields
//         if (req.user.role !== "admin") {
//             delete user.role;
//             delete user.tenant;
//             delete user.customRoles;
//         }

//         await user.save();
//         res.status(200).json({ message: "Profile updated", user });
//     } catch (err) {
//         next(err);
//     }
// }

// exports.getMe = async (req, res, next) => {
//     try {
//         const userId = req.user._id;
//         // console.log('getMe: Fetching user', { userId, cookies: req.cookies, user: req.user.toJSON() });

//         const user = await User.findById(userId)
//             .select('-password')
//             .populate({
//                 path: 'tenant',
//                 populate: { path: 'departments', model: 'Department' },
//             })
//             .populate('department')
//             .populate({
//                 path: 'customRoles',
//                 populate: { path: 'permissions', model: 'Permission' },
//             });

//         if (!user) {
//             //   console.log('getMe: User not found', { userId });
//             return res.status(404).json({ message: 'User not found' });
//         }

//         // console.log('getMe: User fetched', { user: user.toJSON() });
//         return res.status(200).json({ success: true, user });
//     } catch (err) {
//         console.error('getMe error:', { message: err.message, stack: err.stack });
//         return res.status(500).json({ message: 'Server error' });
//     }
// };

// exports.logoutUser = async (req, res) => {
//     const cookieOptions = {
//         httpOnly: true,
//         secure: process.env.NODE_ENV === "production",
//         sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
//     };

//     res.clearCookie("accessToken", cookieOptions);
//     res.clearCookie("refreshToken", cookieOptions);

//     res.status(200).json({ message: "Logged out" });
// };

// exports.refreshAccessToken = async (req, res) => {
//     try {
//         const refreshToken = req.cookies.refreshToken;

//         if (!refreshToken) return res.status(401).json({ message: "No refresh token provided" });

//         // Verify refresh token
//         const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
//         const user = await User.findById(decoded.id);

//         if (!user) return res.status(401).json({ message: "User not found" });

//         // Generate new access token
//         const accessToken = jwt.sign(
//             { id: user._id, email: user.email, role: user.role },
//             JWT_SECRET,
//             { expiresIn: "15m" } // Access token short-lived
//         );

//         res.json({ accessToken, user: { _id: user._id, name: user.name, email: user.email, role: user.role } });
//     } catch (err) {
//         console.error("refreshAccessToken error:", err);
//         return res.status(401).json({ message: "Invalid refresh token" });
//     }
// };

// /controllers/authController.js
const User = require("../models/User");
const OTP = require("../models/OTP");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const sendEmail = require("../utils/sendEmail");
const generateToken = require("../utils/generateToken");
const cloudinary = require("../utils/cloudinary");
const moment = require("moment");
const getBaseURL = require("../utils/getBaseURL");
const Logger = require("../utils/auditLog");

// Helper: Generate OTP Code
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Validation Schemas
const registerSchema = Joi.object({
    name: Joi.string().min(2).max(50).required().messages({
        "string.min": "Name must be at least 2 characters",
        "string.max": "Name cannot exceed 50 characters",
        "any.required": "Name is required",
    }),
    email: Joi.string().email().required().messages({
        "string.email": "Invalid email format",
        "any.required": "Email is required",
    }),
    password: Joi.string().min(6).required().messages({
        "string.min": "Password must be at least 6 characters",
        "any.required": "Password is required",
    }),
});

const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        "string.email": "Invalid email format",
        "any.required": "Email is required",
    }),
    password: Joi.string().required().messages({
        "any.required": "Password is required",
    }),
    source: Joi.string().optional(),
});

const verifyEmailSchema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().length(6).required(),
});

const resendOtpSchema = Joi.object({
    email: Joi.string().email().required(),
    purpose: Joi.string().valid("verify", "reset").required(),
    source: Joi.string().optional(),
});

const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
});

const verifyResetCodeSchema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().length(6).required(),
});

const resetPasswordSchema = Joi.object({
    email: Joi.string().email().required(),
    code: Joi.string().length(6).required(),
    newPassword: Joi.string().min(6).required(),
});

const updateProfileSchema = Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().pattern(/^\+?\d{10,15}$/).allow("").optional(), // Allow phone with validation
    bio: Joi.string().max(500).allow("").optional(), // Allow bio with max length
    currentPassword: Joi.string().optional(),
    newPassword: Joi.string().min(6).optional(),
}).with("newPassword", "currentPassword");


exports.registerUser = async (req, res, next) => {
    try {
        const { error } = registerSchema.validate(req.body);
        if (error) {
            await Logger.error('registerUser', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { name, email, password } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) {
            await Logger.error('registerUser', 'Email already registered', { email });
            return res.status(400).json({ message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            role: "user",
            authProvider: "local",
            tenant: null,
            createdBy: null,
            isVerified: false,
        });

        await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

        const baseURL = getBaseURL().public;
        const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;
        await sendEmail({
            to: email,
            subject: "Verify Your Email",
            html: `<p>Hello ${name || "user"},</p><p>Click this link to verify: <a href="${link}">${link}</a></p><p>This link/code expires in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>`,
        });

        await Logger.info('registerUser', 'User registered successfully', { email });
        res.status(201).json({ message: "User registered. Verification link sent to email." });
    } catch (err) {
        console.error("Register user error:", err);
        await Logger.error('registerUser', 'Server error', { message: err.message, stack: err.stack });
        next(err);
    }
};

// Verify Email Link
exports.verifyEmailLink = async (req, res, next) => {
    try {
        const { code, email } = req.query;

        const { error } = verifyEmailSchema.validate({ code, email });
        if (error) {
            await Logger.error('verifyEmailLink', 'Invalid query', { code, email });
            return res.redirect(`${process.env.RATEPRO_URL}/login?message=invalid-otp`);
        }

        const otp = await OTP.findOne({ email, code, purpose: "verify" });
        if (!otp) {
            await Logger.error('verifyEmailLink', 'OTP not found', { code, email });
            return res.redirect(`${process.env.RATEPRO_URL}/login?message=invalid-otp`);
        }

        if (otp.expiresAt < new Date()) {
            await Logger.error('verifyEmailLink', 'OTP expired', { code, email });
            return res.redirect(`${process.env.RATEPRO_URL}/login?message=otp-expired`);
        }

        const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
        if (!user) {
            await Logger.error('verifyEmailLink', 'User not found', { email });
            return res.redirect(`${process.env.RATEPRO_URL}/login?message=user-not-found`);
        }

        await OTP.deleteMany({ email, purpose: "verify" });

        const baseURL = ['admin', 'companyAdmin'].includes(user.role) ? process.env.FRONTEND_URL : process.env.RATEPRO_URL;

        const accessToken = generateToken({ id: user._id, role: user.role, tenant: user.tenant, customRoles: user.customRoles }, "access");
        const refreshToken = generateToken({ id: user._id, role: user.role, tenant: user.tenant, customRoles: user.customRoles }, "refresh");

        res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.cookie("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", maxAge: 1 * 60 * 60 * 1000 });

        await Logger.info('verifyEmailLink', 'Email verified via link', { email });
        return res.redirect(`${baseURL}/app`);
    } catch (err) {
        console.error("Verify email link error:", err);
        await Logger.error('verifyEmailLink', 'Server error', { message: err.message, stack: err.stack });
        return res.redirect(`${process.env.RATEPRO_URL}/login?message=error`);
    }
};

// Verify Email
exports.verifyEmail = async (req, res, next) => {
    try {
        const { error } = verifyEmailSchema.validate(req.body);
        if (error) {
            await Logger.error('verifyEmail', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, code } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "verify" });
        if (!otp) {
            await Logger.error('verifyEmail', 'Invalid OTP', { email, code });
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (otp.expiresAt < new Date()) {
            await Logger.error('verifyEmail', 'OTP expired', { email, code });
            return res.status(400).json({ message: "OTP expired. Request a new one." });
        }

        await User.findOneAndUpdate({ email }, { isVerified: true });
        await OTP.deleteMany({ email, purpose: "verify" });

        await Logger.info('verifyEmail', 'Email verified successfully', { email });
        res.status(200).json({ message: "Email verified successfully" });
    } catch (err) {
        console.error("Verify email error:", err);
        await Logger.error('verifyEmail', 'Server error', { message: err.message, stack: err.stack });
        next(err);
    }
};
// Resend OTP
exports.resendOtp = async (req, res, next) => {
    try {
        const { error } = resendOtpSchema.validate(req.body);
        if (error) {
            await Logger.error('resendOtp', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, purpose } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            await Logger.error('resendOtp', 'User not found', { email });
            return res.status(404).json({ message: "User not found" });
        }

        await OTP.deleteMany({ email, purpose });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();
        await OTP.create({ email, code: otpCode, expiresAt, purpose });

        const baseURL = ['admin', 'companyAdmin'].includes(user.role) ? process.env.FRONTEND_URL : process.env.RATEPRO_URL;
        const emailContent = {
            to: email,
            subject: purpose === "verify" ? "Verify Your Email" : `OTP Code for ${purpose}`,
            html: purpose === "verify"
                ? `<p>Your new verification code: <b>${otpCode}</b></p><p>Click: <a href="${baseURL}/verify-email?code=${otpCode}&email=${email}">${baseURL}/verify-email?code=${otpCode}&email=${email}</a></p>`
                : `<p>Your OTP Code: ${otpCode}</p>`,
        };

        await sendEmail(emailContent);

        await Logger.info('resendOtp', 'OTP resent successfully', { email, purpose });
        res.status(200).json({ message: "OTP resent to email" });
    } catch (err) {
        console.error('Resend OTP error:', err);
        await Logger.error('resendOtp', 'Server error', { message: err.message, stack: err.stack });
        next(err);
    }
};

// Login User
exports.loginUser = async (req, res, next) => {
    try {
        const { error } = loginSchema.validate(req.body);
        if (error) {
            await Logger.error('loginUser', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, password } = req.body;
        const user = await User.findOne({ email })
            .select("+password")
            .populate([
                { path: "tenant", select: "name domain isActive createdAt" },
                {
                    path: "customRoles",
                    select: "name permissions createdAt",
                    populate: {
                        path: "permissions",
                        model: "Permission",
                        select: "name description group createdAt"
                    }
                }
            ]);

        if (!user) {
            await Logger.error('loginUser', 'User not found', { email });
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await Logger.error('loginUser', 'Invalid password', { email });
            return res.status(401).json({ message: "Invalid password" });
        }

        if (!user.isVerified) {
            await OTP.deleteMany({ email, purpose: "verify" });

            const otpCode = generateOTP();
            const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();
            await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

            const baseURL = ["admin", "companyAdmin", "member"].includes(user.role)
                ? process.env.FRONTEND_URL
                : process.env.RATEPRO_URL;

            const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;
            await sendEmail({
                to: email,
                subject: "Verify Your Email",
                html: `<p>Hello ${user.name},</p><p>Please verify your email before logging in.</p><p>Click: <a href="${link}">${link}</a></p><p>This link expires in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>`,
            });

            await Logger.error('loginUser', 'Email not verified', { email });
            return res.status(401).json({
                message: "Email not verified. A verification link has been sent to your email.",
            });
        }

        const accessToken = generateToken({ _id: user._id.toString(), role: user.role, tenant: user.tenant?._id.toString(), customRoles: user.customRoles.map(r => r._id.toString()) }, "access");
        const refreshToken = generateToken({ _id: user._id.toString(), role: user.role }, "refresh");

        res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
        res.cookie("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", maxAge: 30 * 60 * 60 * 1000 });

        user.lastLogin = Date.now();
        await user.save();

        const safeUser = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            customRoles: user.customRoles,
            authProvider: user.authProvider,
            bio: user.bio,
            phone: user.phone,
            isActive: user.isActive,
            isVerified: user.isVerified,
            surveyStats: user.surveyStats,
            tenant: user.tenant,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            companyProfileUpdated: user.companyProfileUpdated,
            lastLogin: user.lastLogin,
        };

        await Logger.info('loginUser', 'User logged in successfully', { email });
        res.status(200).json({ accessToken, user: safeUser });
    } catch (err) {
        console.error('Login error:', err);
        await Logger.error('loginUser', 'Server error', { message: err.message, stack: err.stack });
        next(err);
    }
};

// Forgot Password
exports.forgotPassword = async (req, res, next) => {
    try {
        const { error } = forgotPasswordSchema.validate(req.body);
        if (error) {
            await Logger.error('forgotPassword', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            await Logger.error('forgotPassword', 'User not found', { email });
            return res.status(404).json({ message: "No user with this email" });
        }

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

        await OTP.deleteMany({ email, purpose: "reset" });
        await OTP.create({ email, code: otpCode, expiresAt, purpose: "reset" });

        await sendEmail({
            to: email,
            subject: "Reset Password OTP",
            html: `<p>Your OTP Code to reset password: <b>${otpCode}</b></p>`,
        });

        await Logger.info('forgotPassword', 'OTP sent successfully', { email });
        res.status(200).json({ message: "OTP sent for password reset" });
    } catch (err) {
        console.error("Forgot password error:", err);
        await Logger.error('forgotPassword', 'Server error', { message: err.message, stack: err.stack });
        next(err);
    }
};

// Verify Reset Code
exports.verifyResetCode = async (req, res, next) => {
    try {
        const { error } = verifyResetCodeSchema.validate(req.body, { allowUnknown: true });
        if (error) {
            await Logger.error('verifyResetCode', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, code } = req.body;

        const otpRecord = await OTP.findOne({
            email,
            code,
            purpose: "reset",
            expiresAt: { $gt: new Date() },
        });

        if (!otpRecord) {
            await Logger.error('verifyResetCode', 'Invalid or expired OTP', { email });
            return res.status(400).json({ message: "Invalid or expired code" });
        }

        await Logger.info('verifyResetCode', 'OTP verified successfully', { email });
        res.status(200).json({ message: "OTP verified. You can reset your password now." });
    } catch (err) {
        console.error("Verify reset code error:", err);
        await Logger.error('verifyResetCode', 'Server error', { message: err.message, stack: err.stack });
        res.status(500).json({ message: "Server error" });
    }
};

// Reset Password
exports.resetPassword = async (req, res, next) => {
    try {
        const { error } = resetPasswordSchema.validate(req.body);
        if (error) {
            await Logger.error('resetPassword', 'Validation failed', { details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const { email, code, newPassword } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "reset" });
        if (!otp) {
            await Logger.error('resetPassword', 'Invalid OTP', { email });
            return res.status(400).json({ message: "Invalid OTP" });
        }

        if (otp.expiresAt < new Date()) {
            await Logger.error('resetPassword', 'OTP expired', { email });
            return res.status(400).json({ message: "OTP expired" });
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await User.findOneAndUpdate({ email }, { password: hashed });
        await OTP.deleteMany({ email, purpose: "reset" });

        await Logger.info('resetPassword', 'Password reset successful', { email });
        res.status(200).json({ message: "Password reset successful" });
    } catch (err) {
        console.error("Reset password error:", err);
        await Logger.error('resetPassword', 'Server error', { message: err.message, stack: err.stack });
        next(err);
    }
};

// Update Profile
exports.updateProfile = async (req, res, next) => {
    try {
        const { error } = updateProfileSchema.validate(req.body);
        if (error) {
            await Logger.error('updateProfile', 'Validation failed', { userId: req.user._id, details: error.details[0].message });
            return res.status(400).json({ message: error.details[0].message });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            await Logger.error('updateProfile', 'User not found', { userId: req.user._id });
            return res.status(404).json({ message: "User not found" });
        }

        const { name, currentPassword, newPassword } = req.body;

        // Update avatar
        if (req.file) {
            if (user.avatar?.public_id) await cloudinary.uploader.destroy(user.avatar.public_id);
            const result = await cloudinary.uploader.upload(req.file.path, { folder: "avatars" });
            user.avatar = { public_id: result.public_id, url: result.secure_url };
        }

        // Update name
        if (name) user.name = name;

        // Update password
        if (currentPassword && newPassword) {
            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) {
                await Logger.error('updateProfile', 'Current password incorrect', { userId: req.user._id });
                return res.status(400).json({ message: "Current password incorrect" });
            }
            user.password = await bcrypt.hash(newPassword, 12);
        }

        // Restrict sensitive fields for non-admin
        if (req.user.role !== "admin") {
            delete user.role;
            delete user.tenant;
            delete user.customRoles;
        }

        await user.save();
        await Logger.info('updateProfile', 'Profile updated successfully', { userId: req.user._id });

        res.status(200).json({ message: "Profile updated", user });
    } catch (err) {
        console.error("Update profile error:", err);
        await Logger.error('updateProfile', 'Server error', { userId: req.user._id, message: err.message, stack: err.stack });
        next(err);
    }
};

// Get Current User
exports.getMe = async (req, res, next) => {
    try {
        const userId = req.user._id;

        const user = await User.findById(userId)
            .select('-password')
            .populate({
                path: 'tenant',
                populate: { path: 'departments', model: 'Department' },
            })
            .populate('department')
            .populate({
                path: 'customRoles',
                populate: { path: 'permissions', model: 'Permission' },
            });

        if (!user) {
            // ❌ Log error: user not found
            await Logger.error('getMe', 'User not found', { userId });
            return res.status(404).json({ message: 'User not found' });
        }

        // ✅ Log success
        await Logger.info('getMe', 'User fetched successfully', { userId });

        return res.status(200).json({ success: true, user });
    } catch (err) {
        // ❌ Log error
        console.error('getMe error:', { message: err.message, stack: err.stack });
        await Logger.error('getMe', 'Server error fetching user', {
            message: err.message,
            stack: err.stack,
            userId: req.user?._id,
        });

        return res.status(500).json({ message: 'Server error' });
    }
};

// Logout User
exports.logoutUser = async (req, res) => {
    try {
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        };

        res.clearCookie("accessToken", cookieOptions);
        res.clearCookie("refreshToken", cookieOptions);

        // ✅ Log successful logout
        await Logger.info("logoutUser", "User logged out successfully", {
            userId: req.user?._id,
            email: req.user?.email,
        });

        res.status(200).json({ message: "Logged out" });
    } catch (err) {
        // ❌ Log error
        console.error("logoutUser error:", err);
        await Logger.error("logoutUser", "Error during user logout", {
            message: err.message,
            stack: err.stack,
            userId: req.user?._id,
        });

        res.status(500).json({ message: "Logout failed", error: err.message });
    }
};

// Refresh Access Token
exports.refreshAccessToken = async (req, res) => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken)
            return res.status(401).json({ message: "No refresh token provided" });

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decoded.id);

        if (!user)
            return res.status(401).json({ message: "User not found" });

        // Generate new access token
        const accessToken = jwt.sign(
            { id: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: "15m" }
        );

        const responseData = {
            accessToken,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        };

        // ✅ Log success
        await Logger.info("refreshAccessToken", "Access token refreshed successfully", {
            userId: user._id,
            email: user.email,
        });

        return res.status(200).json(responseData);
    } catch (err) {
        console.error("refreshAccessToken error:", err);

        // ❌ Log error
        await Logger.error("refreshAccessToken", "Error refreshing access token", {
            message: err.message,
            stack: err.stack,
        });

        return res.status(401).json({ message: "Invalid refresh token" });
    }
};