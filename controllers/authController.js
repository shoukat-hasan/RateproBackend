const User = require("../models/User");
const OTP = require("../models/OTP");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/sendEmail");
const generateToken = require("../utils/generateToken");
const cloudinary = require("../utils/cloudinary");
const crypto = require("crypto");
const moment = require("moment");
const getBaseURL = require("../utils/getBaseURL");

// === Helper: Generate OTP Code ===
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// exports.registerUser = async (req, res, next) => {
//     try {
//         const { name, email, password, role, source = "public" } = req.body;

//         const userExists = await User.findOne({ email });
//         if (userExists) return res.status(400).json({ message: "Email already registered" });

//         const hashedPassword = await bcrypt.hash(password, 12);
//         const user = await User.create({ name, email, password: hashedPassword, role });

//         const otpCode = generateOTP();
//         const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, 'minutes').toDate();

//         await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

//         // const link = `${process.env.FRONTEND_URL}/verify-email?code=${otpCode}&email=${email}`;

//         // ✅ Choose base URL based on `source`
//         const baseURL = source === "admin"
//             ? process.env.FRONTEND_URL
//             : process.env.PUBLIC_FRONTEND_URL;

//         const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;

//         await sendEmail({
//             to: email,
//             subject: "Verify Your Email",
//             html: `
//     <p>Hello ${name || "user"},</p>
//     <p>Your verification code is: <b>${otpCode}</b></p>
//     <p>Or click this link to verify directly: <a href="${link}">${link}</a></p>
//     <p>This link/code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
//   `
//         });


//         res.status(201).json({ message: "User registered. verification link sent to email." });

//     } catch (err) {
//         next(err);
//     }
// };
exports.registerUser = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;
        console.log("Received Role:", role);

        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: "Email already registered" });

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = await User.create({ name, email, password: hashedPassword, role });
        console.log("Saved User:", user);

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, 'minutes').toDate();

        await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

        const origin = req.headers.origin || "";
        let source = "public";
        if (origin.includes("admin") && (role === "admin" || role === "company")) {
            source = "admin";
        }

        if (!role || !["user", "company", "admin"].includes(role)) {
            return res.status(400).json({ message: "Invalid or missing role" });
        }

        const urls = getBaseURL();
        const baseURL = source === "admin" ? urls.admin : urls.public;

        const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`
        // const link = `${process.env.RATEPRO_URL}/verify-email?code=${otpCode}&email=${email}`;

        await sendEmail({
            to: email,
            subject: "Verify Your Email",
            html: `
    <p>Hello ${name || "user"},</p>
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

        // await User.findOneAndUpdate({ email }, { isVerified: true });
        const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });
        const baseURL = user?.role === "admin" || user?.role === "company"
            ? process.env.FRONTEND_URL
            : process.env.PUBLIC_FRONTEND_URL;
        await OTP.deleteMany({ email, purpose: "verify" });

        // return res.redirect(`${process.env.FRONTEND_URL}/login?message=verified`);
        return res.redirect(`${baseURL}/login?message=verified`);

    } catch (err) {
        console.log(err);
        return res.redirect(`${process.env.FRONTEND_URL}/login?message=error`);
    }
};
exports.verifyEmail = async (req, res, next) => {
    try {
        const { email, code } = req.body;
        console.log("BODY:", req.body);
        if (!email || !code) return res.status(400).json({ message: "Missing code or email" });

        // const otp = await OTP.findOne({ email, code, purpose: "verify" });
        const otp = await OTP.findOne({ email, purpose: "verify" }).sort({ createdAt: -1 });
        if (!otp || otp.code !== code)
            return res.status(400).json({ message: "Invalid OTP" });

        // if (!otp) return res.status(400).json({ message: "Invalid OTP" });

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
        // const { email, purpose } = req.body;
        const { email, purpose, source = "public" } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        await OTP.deleteMany({ email, purpose });

        const otpCode = generateOTP();
        const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, 'minutes').toDate();

        await OTP.create({ email, code: otpCode, expiresAt, purpose });

        // await sendEmail({
        //     to: email,
        //     subject: `OTP Code for ${purpose}`,
        //     text: `Your new OTP Code is: ${otpCode}`
        // });

        let emailContent = { to: email };

        if (purpose === "verify") {
            const baseURL = source === "admin"
                ? process.env.FRONTEND_URL
                : process.env.PUBLIC_FRONTEND_URL;

            const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;

            emailContent.subject = "Verify Your Email";
            emailContent.html = `
    <p>Your new verification code: <b>${otpCode}</b></p>
    <p>Or click the link: <a href="${link}">${link}</a></p>
  `;
        } else {
            emailContent.subject = `OTP Code for ${purpose}`;
            emailContent.text = `Your OTP Code: ${otpCode}`;
        }

        await sendEmail(emailContent);

        res.status(200).json({ message: "OTP resent to email" });

    } catch (err) {
        next(err);
    }
};

// exports.loginUser = async (req, res, next) => {
//     try {
//         // const { email, password } = req.body;
//         const { email, password, source = "public" } = req.body;

//         const user = await User.findOne({ email });
//         if (!user || !(await bcrypt.compare(password, user.password)))
//             return res.status(401).json({ message: "Invalid email or password" });

//         if (!user.isVerified) {
//             // Resend OTP
//             await OTP.deleteMany({ email, purpose: "verify" });

//             const otpCode = generateOTP();
//             const expiresAt = moment().add(process.env.EMAIL_VERIFICATION_EXPIRE_DAYS, 'days').toDate();

//             await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });
//             // const baseURL = source === "admin"
//             //     ? process.env.FRONTEND_URL
//             //     : process.env.RATEPRO_URL
//             //     : process.env.PRI_FRONTEND_URL_LOCAL
//             //     : process.env.SEC_FRONTEND_URL_LOCAL;

//             // const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;
//             const urls = getBaseURL();
//             const baseURL = source === "admin" ? urls.admin : urls.public;

//             const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`

//             // const link = `${process.env.FRONTEND_URL}/verify-email?code=${otpCode}&email=${email}`;
//             await sendEmail({
//                 to: email,
//                 subject: "Verify Your Email Again",
//                 html: `
//       <p>Hello,</p>
//       <p>Your new OTP Code: <b>${otpCode}</b></p>
//       <p>Or click here: <a href="${link}">${link}</a></p>
//     `
//             });

//             return res.status(401).json({
//                 message: "Email not verified. A new verification link has been sent.",
//             });
//         }

//         const accessToken = generateToken(user._id, "access");
//         const refreshToken = generateToken(user._id, "refresh");

//         // res.cookie("refreshToken", refreshToken, {
//         //     httpOnly: true,
//         //     secure: process.env.NODE_ENV === "production",
//         //     maxAge: 30 * 24 * 60 * 60 * 1000,
//         // });

//         // res.cookie("token", accessToken, {
//         //     httpOnly: true,
//         //     secure: process.env.NODE_ENV === "production",
//         //     maxAge: 15 * 60 * 1000, // 15 minutes
//         // })

//         res.cookie("refreshToken", refreshToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // ✅ key fix
//             maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
//         });

//         res.cookie("token", accessToken, {
//             httpOnly: true,
//             secure: process.env.NODE_ENV === "production",
//             sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // ✅ key fix
//             maxAge: 15 * 60 * 1000, // 15 minutes
//         });

//         // res.status(200).json({ accessToken, user });
//         res.status(200).json({
//             accessToken,
//             user: {
//                 _id: user._id,
//                 name: user.name,
//                 email: user.email,
//                 role: user.role,
//                 avatar: user.avatar,
//                 isActive: user.isActive,
//                 isEmailVerified: user.isVerified,
//                 lastLogin: user.lastLogin,
//                 createdAt: user.createdAt
//             }
//         });

//     } catch (err) {
//         next(err);
//     }
// };

exports.loginUser = async (req, res, next) => {
    try {
        const { email, password, source = "public" } = req.body;

        const user = await User.findOne({ email });
        
        // 👤 User not found
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ message: "Invalid email or password" });

        const isSystemAdmin = user.role === "admin" && user.email === "admin@ratepro.com";

        // 🔐 Force OTP every time for companyAdmin/member
        const needsOTP = (user.role === "companyAdmin" || user.role === "member") && !isSystemAdmin;

        if (needsOTP) {
            // Clean previous OTPs
            await OTP.deleteMany({ email, purpose: "login_verify" });

            const otpCode = generateOTP();
            const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

            await OTP.create({ email, code: otpCode, expiresAt, purpose: "login_verify" });

            const urls = getBaseURL();
            const baseURL = source === "admin" ? urls.admin : urls.public;
            const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}&login=true`;

            await sendEmail({
                to: email,
                subject: "Login Verification Code",
                html: `
            <p>Hello ${user.name},</p>
            <p>Someone is trying to login using your credentials.</p>
            <p>Click to verify it's you: <a href="${link}">${link}</a></p>
            <p>This code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
          `
            });

            return res.status(401).json({
                message: "Login verification required. A verification link has been sent to your email.",
            });
        }

        // ✅ If no OTP needed (like system admin), proceed
        const accessToken = generateToken(user._id, "access");
        const refreshToken = generateToken(user._id, "refresh");

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            // secure: false, // ✅ in dev
            // sameSite: "None", // ✅ force sending in dev
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            // secure: false, // 🔥 localhost = false
            // sameSite: "Lax", // 🔥 localhost = Lax
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            accessToken,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                avatar: user.avatar,
                isActive: user.isActive,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
            }
        });

    } catch (err) {
        console.error("Login Error:", err);
        next(err);
    }
};

exports.verifyLoginOTP = async (req, res, next) => {
    try {
        const { email, code } = req.body;

        const otp = await OTP.findOne({ email, code, purpose: "login_verify" });
        if (!otp) return res.status(400).json({ message: "Invalid or expired OTP" });

        if (moment().isAfter(otp.expiresAt)) {
            await OTP.deleteOne({ _id: otp._id });
            return res.status(400).json({ message: "OTP expired" });
        }

        await OTP.deleteOne({ _id: otp._id });

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: "User not found" });

        // 🧠 Create payload for token
        const payload = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatar: user.avatar,
            isActive: user.isActive,
            lastLogin: user.lastLogin,
            createdAt: user.createdAt,
        };

        const accessToken = jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {
            expiresIn: "15m"
        });


        const refreshToken = jwt.sign({ _id: user._id }, process.env.REFRESH_TOKEN_SECRET, {
            expiresIn: "30d"
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            // secure: false, // ✅ in dev
            // sameSite: "None", // ✅ force sending in dev
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            // secure: false, // 🔥 localhost = false
            // sameSite: "Lax", // 🔥 localhost = Lax
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({ accessToken, user: payload, });

    } catch (err) {
        console.error("OTP Verify Error:", err);
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
        console.log("Saving OTP to DB...");
        const savedOTP = await OTP.create({ email, code: otpCode, expiresAt, purpose: "reset" });
        console.log("Saved OTP:", savedOTP);

        await sendEmail({
            to: email,
            subject: "Reset Password OTP",
            text: `Your OTP Code to reset password: ${otpCode}`
        });

        res.status(200).json({ message: "OTP sent for password reset" });

    } catch (err) {
        console.error("OTP DB Error:", err);
        next(err);
    }
};

// exports.resetPassword = async (req, res, next) => {
//     try {
//         const { email, code, newPassword } = req.body;

//         const otp = await OTP.findOne({ email, code, purpose: "reset" });
//         if (!otp) return res.status(400).json({ message: "Invalid OTP" });
//         if (otp.expiresAt < new Date())
//             return res.status(400).json({ message: "OTP expired" });

//         const hashed = await bcrypt.hash(newPassword, 12);
//         await User.findOneAndUpdate({ email }, { password: hashed });
//         await OTP.deleteMany({ email, purpose: "reset" });

//         res.status(200).json({ message: "Password reset successful" });

//     } catch (err) {
//         next(err);
//     }
// };

exports.resetPassword = async (req, res, next) => {
    console.log("🔥 Reset password route hit");
    try {
        const { email, code, newPassword } = req.body;

        console.log("Incoming:", { email, code, newPassword });

        const otp = await OTP.findOne({ email, code, purpose: "reset" });
        console.log("Found OTP:", otp);

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


exports.verifyResetCode = async (req, res) => {
    const { email, code } = req.body;

    try {
        // Find OTP in OTP collection
        const otpRecord = await OTP.findOne({
            email,
            code,
            purpose: "reset",
            expiresAt: { $gt: new Date() },
        });

        if (!otpRecord) {
            return res.status(400).json({ message: "Invalid or expired code" });
        }

        return res.status(200).json({ message: "OTP verified. You can reset your password now." });
    } catch (error) {
        console.error("Verify reset code error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

// exports.getMe = async (req, res, next) => {
//     try {
//         const user = await User.findById(req.user._id).select("-password");
//         if (!user) return res.status(404).json({ message: "User not found" });

//         res.status(200).json({ success: true, user });
//     } catch (err) {
//         console.error("getMe error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

exports.getMe = async (req, res, next) => {
    try {
        let userId;

        // Case 1: JWT in cookie
        if (req.cookies.accessToken) {
            const decoded = jwt.verify(req.cookies.accessToken, process.env.ACCESS_TOKEN_SECRET);
            userId = decoded._id;
        }

        // Case 2: JWT from protect middleware (e.g., Bearer token)
        else if (req.user?._id) {
            userId = req.user._id;
        }

        if (!userId) return res.status(401).json({ message: "Unauthorized" });

        const user = await User.findById(userId).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({ success: true, user });
    } catch (err) {
        console.error("getMe error:", err);
        res.clearCookie("token");
        res.status(401).json({ message: "Invalid or expired token" });
    }
};

exports.logoutUser = (req, res) => {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.status(200).json({ message: "Logged out" });
};

exports.refreshAccessToken = async (req, res, next) => {
    console.log("🌐 Refresh API called!");
    try {
        const token = req.cookies.refreshToken;
        if (!token) {
            return res.status(401).json({ message: "No refresh token provided" });
        }

        // 🔐 Verify refresh token
        const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
        const user = await User.findById(decoded._id);
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }

        // ✅ Create new access token
        const accessToken = jwt.sign(
            { id: user._id },
            process.env.ACCESS_TOKEN_SECRET,
            { expiresIn: "30m" } // 30 minutes
        );

        // ✅ Set accessToken cookie
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
            maxAge: 15 * 60 * 1000, // 30 min
        });

        console.log("🍪 refreshToken in cookies:", req.cookies.refreshToken);
        // 🧠 Debug log
        console.log(`🔄 [${new Date().toLocaleTimeString()}] Issued new accessToken via refreshToken for user: ${user.email}`);

        res.status(200).json({ success: true });
    } catch (err) {
        return res.status(401).json({ message: "Invalid refresh token" });
    }
};