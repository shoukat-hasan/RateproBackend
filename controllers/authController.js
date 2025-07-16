const User = require("../models/User");
const OTP = require("../models/OTP");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const generateToken = require("../utils/generateToken");
const cloudinary = require("../utils/cloudinary");
const crypto = require("crypto");
const moment = require("moment");

// === Helper: Generate OTP Code ===
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.registerUser = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Email already registered" });

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: hashedPassword, role });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, 'minutes').toDate();

        await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

        const link = `${process.env.FRONTEND_URL}/verify-email?code=${otpCode}&email=${email}`;

        await sendEmail({
            to: email,
            subject: "Verify Your Email",
            html: `
    <p>Hello ${name || "user"},</p>
    <p>Your verification code is: <b>${otpCode}</b></p>
    <p>Or click this link to verify directly: <a href="${link}">${link}</a></p>
    <p>This link/code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
  `
        });


        res.status(201).json({ message: "User registered. verification link sent to email." });

    } catch (err) {
        next(err);
    }
};
exports.verifyEmailLink = async (req, res, next) => {
    try {
        const { code, email } = req.query;

        const otp = await OTP.findOne({ email, code, purpose: "verify" });
        if (!otp) return res.redirect(`${process.env.FRONTEND_URL}/login?message=invalid-otp`);

        if (otp.expiresAt < new Date()) {
            return res.redirect(`${process.env.FRONTEND_URL}/login?message=otp-expired`);
        }

        await User.findOneAndUpdate({ email }, { isVerified: true });
        await OTP.deleteMany({ email, purpose: "verify" });

        return res.redirect(`${process.env.FRONTEND_URL}/login?message=verified`);

    } catch (err) {
        console.log(err);
        return res.redirect(`${process.env.FRONTEND_URL}/login?message=error`);
    }
};


exports.verifyEmail = async (req, res, next) => {
    try {
        const { email, code } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "verify" });
        if (!otp) return res.status(400).json({ message: "Invalid OTP" });

        if (otp.expiresAt < new Date())
            return res.status(400).json({ message: "OTP expired. Request a new one." });

        await User.findOneAndUpdate({ email }, { isVerified: true });
        await OTP.deleteMany({ email, purpose: "verify" });

        res.status(200).json({ message: "Email verified successfully" });

    } catch (err) {
        next(err);
    }
};

exports.resendOtp = async (req, res, next) => {
    try {
        const { email, purpose } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        await OTP.deleteMany({ email, purpose });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, 'minutes').toDate();

        await OTP.create({ email, code: otpCode, expiresAt, purpose });

        await sendEmail({
            to: email,
            subject: `OTP Code for ${purpose}`,
            text: `Your new OTP Code is: ${otpCode}`
        });

        res.status(200).json({ message: "OTP resent to email" });

    } catch (err) {
        next(err);
    }
};

exports.loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ message: "Invalid email or password" });

        if (!user.isVerified) {
            // Resend OTP
            await OTP.deleteMany({ email, purpose: "verify" });

            const otpCode = generateOTP();
            const expiresAt = moment().add(process.env.EMAIL_VERIFICATION_EXPIRE_DAYS, 'days').toDate();

            await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

            const link = `${process.env.FRONTEND_URL}/verify-email?code=${otpCode}&email=${email}`;
            await sendEmail({
                to: email,
                subject: "Verify Your Email Again",
                html: `
      <p>Hello,</p>
      <p>Your new OTP Code: <b>${otpCode}</b></p>
      <p>Or click here: <a href="${link}">${link}</a></p>
    `
            });

            return res.status(401).json({
                message: "Email not verified. A new verification link has been sent.",
            });
        }


        const accessToken = generateToken(user._id, "access");
        const refreshToken = generateToken(user._id, "refresh");

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({ accessToken, user });

    } catch (err) {
        next(err);
    }
};

exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "No user with this email" });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, 'minutes').toDate();

        await OTP.deleteMany({ email, purpose: "reset" });
        await OTP.create({ email, code: otpCode, expiresAt, purpose: "reset" });

        await sendEmail({
            to: email,
            subject: "Reset Password OTP",
            text: `Your OTP Code to reset password: ${otpCode}`
        });

        res.status(200).json({ message: "OTP sent for password reset" });

    } catch (err) {
        next(err);
    }
};

exports.resetPassword = async (req, res, next) => {
    try {
        const { email, code, newPassword } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "reset" });
        if (!otp) return res.status(400).json({ message: "Invalid OTP" });
        if (otp.expiresAt < new Date())
            return res.status(400).json({ message: "OTP expired" });

        const hashed = await bcrypt.hash(newPassword, 12);
        await User.findOneAndUpdate({ email }, { password: hashed });
        await OTP.deleteMany({ email, purpose: "reset" });

        res.status(200).json({ message: "Password reset successful" });

    } catch (err) {
        next(err);
    }
};

exports.updateProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        const { name, currentPassword, newPassword } = req.body;

        if (req.file) {
            if (user.avatar?.public_id)
                await cloudinary.uploader.destroy(user.avatar.public_id);

            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "avatars",
            });

            user.avatar = {
                public_id: result.public_id,
                url: result.secure_url,
            };
        }

        if (name) user.name = name;

        if (currentPassword && newPassword) {
            const match = await bcrypt.compare(currentPassword, user.password);
            if (!match) return res.status(400).json({ message: "Current password incorrect" });

            user.password = await bcrypt.hash(newPassword, 12);
        }

        await user.save();
        res.status(200).json({ message: "Profile updated", user });

    } catch (err) {
        next(err);
    }
};

exports.logoutUser = (req, res) => {
    res.clearCookie("refreshToken");
    res.status(200).json({ message: "Logged out successfully" });
};
