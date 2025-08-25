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
        // Validate input
        const { error } = registerSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { name, email, password } = req.body;

        // Check existing user
        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Email already registered" });

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Generate OTP
        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

        // Create user
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

        // Save OTP
        await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

        // Send verification email
        const baseURL = getBaseURL().public;
        const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;
        await sendEmail({
            to: email,
            subject: "Verify Your Email",
            html: `
        <p>Hello ${name || "user"},</p>
        <p>Click this link to verify: <a href="${link}">${link}</a></p>
        <p>This link/code expires in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
      `,
        });

        res.status(201).json({ message: "User registered. Verification link sent to email." });
    } catch (err) {
        next(err);
    }
};

exports.verifyEmailLink = async (req, res, next) => {
    try {
        const { code, email } = req.query;

        // Validate query
        const { error } = verifyEmailSchema.validate({ code, email });
        if (error) return res.redirect(`${process.env.RATEPRO_URL}/login?message=invalid-otp`);

        const otp = await OTP.findOne({ email, code, purpose: "verify" });
        if (!otp) return res.redirect(`${process.env.RATEPRO_URL}/login?message=invalid-otp`);

        if (otp.expiresAt < new Date()) {
            return res.redirect(`${process.env.RATEPRO_URL}/login?message=otp-expired`);
        }

        const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
        if (!user) return res.redirect(`${process.env.RATEPRO_URL}/login?message=user-not-found`);

        const baseURL = user.role === "admin" || user.role === "companyAdmin"
            ? process.env.FRONTEND_URL
            : process.env.RATEPRO_URL;

        await OTP.deleteMany({ email, purpose: "verify" });

        // Generate tokens
        const accessToken = generateToken({ id: user._id, role: user.role, tenant: user.tenant, customRoles: user.customRoles }, "access");
        const refreshToken = generateToken({ id: user._id, role: user.role, tenant: user.tenant, customRoles: user.customRoles }, "refresh");

        // Set cookies
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge: 1 * 60 * 60 * 1000, // 1 hour
        });

        return res.redirect(`${baseURL}/app`);
    } catch (err) {
        console.error("Verify email link error:", err);
        return res.redirect(`${process.env.RATEPRO_URL}/login?message=error`);
    }
};

exports.verifyEmail = async (req, res, next) => {
    try {
        const { error } = verifyEmailSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, code } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "verify" });
        if (!otp) return res.status(400).json({ message: "Invalid OTP" });

        if (otp.expiresAt < new Date()) {
            return res.status(400).json({ message: "OTP expired. Request a new one." });
        }

        await User.findOneAndUpdate({ email }, { isVerified: true });
        await OTP.deleteMany({ email, purpose: "verify" });

        res.status(200).json({ message: "Email verified successfully" });
    } catch (err) {
        next(err);
    }
};

exports.resendOtp = async (req, res, next) => {
    try {
        const { error } = resendOtpSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, purpose } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        await OTP.deleteMany({ email, purpose });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

        await OTP.create({ email, code: otpCode, expiresAt, purpose });

        const baseURL = user.role === "admin" || user.role === "companyAdmin"
            ? process.env.FRONTEND_URL
            : process.env.RATEPRO_URL;

        const emailContent = {
            to: email,
            subject: purpose === "verify" ? "Verify Your Email" : `OTP Code for ${purpose}`,
            html: purpose === "verify"
                ? `<p>Your new verification code: <b>${otpCode}</b></p><p>Click: <a href="${baseURL}/verify-email?code=${otpCode}&email=${email}">${baseURL}/verify-email?code=${otpCode}&email=${email}</a></p>`
                : `<p>Your OTP Code: ${otpCode}</p>`,
        };

        await sendEmail(emailContent);

        res.status(200).json({ message: "OTP resent to email" });
    } catch (err) {
        next(err);
    }
};

exports.loginUser = async (req, res, next) => {
    try {
        const { error } = loginSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, password } = req.body;

        // === find user with nested populate ===
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
                        select: "name description group createdAt" // <-- full permission detail
                    }
                }
            ]);

        if (!user) return res.status(404).json({ message: "User not found" });

        // === check password ===
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: "Invalid password" });

        // === verify email check ===
        if (!user.isVerified) {
            await OTP.deleteMany({ email, purpose: "verify" });

            const otpCode = generateOTP();
            const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();
            await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

            const baseURL =
                ["admin", "companyAdmin", "member"].includes(user.role)
                    ? process.env.FRONTEND_URL
                    : process.env.RATEPRO_URL;

            const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;

            await sendEmail({
                to: email,
                subject: "Verify Your Email",
                html: `
                  <p>Hello ${user.name},</p>
                  <p>Please verify your email before logging in.</p>
                  <p>Click: <a href="${link}">${link}</a></p>
                  <p>This link expires in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
                `,
            });

            return res.status(401).json({
                message: "Email not verified. A verification link has been sent to your email.",
            });
        }

        // === generate tokens ===
        const accessToken = generateToken(
            {
                _id: user._id.toString(),
                role: user.role,
                tenant: user.tenant ? user.tenant._id.toString() : null,
                customRoles: user.customRoles.map(r => r._id.toString())
            },
            "access"
        );

        const refreshToken = generateToken(
            {
                _id: user._id.toString(),
                role: user.role,
            },
            "refresh"
        );

        // === set cookies ===
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        // === safeUser with fully populated data ===
        const safeUser = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            customRoles: user.customRoles, // now includes full permissions[]
            authProvider: user.authProvider,
            bio: user.bio,
            phone: user.phone,
            isActive: user.isActive,
            isVerified: user.isVerified,
            surveyStats: user.surveyStats,
            tenant: user.tenant, // populated object {name, domain, ...}
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            companyProfileUpdated: user.companyProfileUpdated,
        };

        res.status(200).json({
            accessToken,
            user: safeUser,
        });
    } catch (err) {
        console.error("❌ Login Error:", err);
        next(err);
    }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const { error } = forgotPasswordSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "No user with this email" });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

        await OTP.deleteMany({ email, purpose: "reset" });
        await OTP.create({ email, code: otpCode, expiresAt, purpose: "reset" });

        await sendEmail({
            to: email,
            subject: "Reset Password OTP",
            html: `<p>Your OTP Code to reset password: <b>${otpCode}</b></p>`,
        });

        res.status(200).json({ message: "OTP sent for password reset" });
    } catch (err) {
        console.error("Forgot password error:", err);
        next(err);
    }
};

exports.verifyResetCode = async (req, res) => {
    try {
        const { error } = verifyResetCodeSchema.validate(req.body, { allowUnknown: true });
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, code } = req.body;

        const otpRecord = await OTP.findOne({
            email,
            code,
            purpose: "reset",
            expiresAt: { $gt: new Date() },
        });

        if (!otpRecord) return res.status(400).json({ message: "Invalid or expired code" });

        res.status(200).json({ message: "OTP verified. You can reset your password now." });
    } catch (err) {
        console.error("Verify reset code error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { error } = resetPasswordSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const { email, code, newPassword } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "reset" });
        if (!otp) return res.status(400).json({ message: "Invalid OTP" });

        if (otp.expiresAt < new Date()) {
            return res.status(400).json({ message: "OTP expired" });
        }

        const hashed = await bcrypt.hash(newPassword, 12);
        await User.findOneAndUpdate({ email }, { password: hashed });
        await OTP.deleteMany({ email, purpose: "reset" });

        res.status(200).json({ message: "Password reset successful" });
    } catch (err) {
        console.error("Reset password error:", err);
        next(err);
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const { error } = updateProfileSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        const { name, currentPassword, newPassword } = req.body;

        // Tenant scoping (for companyAdmin/member)
        // if (req.user.tenant && req.tenantId && req.user.tenant.toString() !== req.tenantId) {
        //     return res.status(403).json({ message: "Access denied: Wrong tenant" });
        // }

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
            if (!match) return res.status(400).json({ message: "Current password incorrect" });
            user.password = await bcrypt.hash(newPassword, 12);
        }

        // Restrict sensitive fields
        if (req.user.role !== "admin") {
            delete user.role;
            delete user.tenant;
            delete user.customRoles;
        }

        await user.save();
        res.status(200).json({ message: "Profile updated", user });
    } catch (err) {
        next(err);
    }
};

exports.getMe = async (req, res, next) => {
    try {
        const userId = req.user._id;
        // console.log('getMe: Fetching user', { userId, cookies: req.cookies, user: req.user.toJSON() });

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
            //   console.log('getMe: User not found', { userId });
            return res.status(404).json({ message: 'User not found' });
        }

        // console.log('getMe: User fetched', { user: user.toJSON() });
        return res.status(200).json({ success: true, user });
    } catch (err) {
        console.error('getMe error:', { message: err.message, stack: err.stack });
        return res.status(500).json({ message: 'Server error' });
    }
};

exports.logoutUser = async (req, res) => {
    const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    };

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);

    res.status(200).json({ message: "Logged out" });
};