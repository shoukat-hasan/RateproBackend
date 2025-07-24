const User = require("../models/User");
const OTP = require("../models/OTP");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../utils/cloudinary");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const moment = require("moment");
const getBaseURL = require("../utils/getBaseURL");

// === Helper: Generate OTP Code ===
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// === CREATE USER ===
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, isActive } = req.body;

    // Check if email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create new user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      isActive, // boolean already handled from frontend
      createdBy: req.user._id,
      company: req.user.role === "company" ? req.user._id : undefined,
    });

    // 🔐 Generate OTP for email verification
    const otpCode = generateOTP();
    const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

    await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

    // 🌐 Determine the baseURL from the request origin
    const origin = req.headers.origin || "";
    let source = "public";
    if (origin.includes("admin") && (role === "admin" || role === "company")) {
      source = "admin";
    }

    const urls = getBaseURL();
    const baseURL = source === "admin" ? urls.admin : urls.public;

    const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;

    // 📧 Send verification email
    await sendEmail({
      to: email,
      subject: "Verify Your Email",
      html: `
        <p>Hello ${name || "user"},</p>
        <p>Please verify your email address by clicking the link below:</p>
        <p><a href="${link}">${link}</a></p>
        <p>This link/code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
      `,
    });

    res.status(201).json({ message: "User created. Verification link sent to email.", user });
  } catch (err) {
    console.error("Error creating user:", err);
    next(err);
  }
};

// === UPDATE USER ===
// exports.updateUser = async (req, res, next) => {
//   try {
//     const { name, role, isActive } = req.body; // ✅ include isActive

//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // ✅ Handle avatar upload
//     if (req.file) {
//       if (user.avatar?.public_id) {
//         await cloudinary.uploader.destroy(user.avatar.public_id);
//       }

//       const uploaded = await cloudinary.uploader.upload(req.file.path, {
//         folder: "avatars",
//       });

//       user.avatar = {
//         public_id: uploaded.public_id,
//         url: uploaded.secure_url,
//       };
//     }

//     // ✅ Assign fields
//     if (name) user.name = name;
//     if (role) user.role = role;

//     // ✅ Handle isActive update only if it’s boolean (to avoid undefined overwriting)
//     if (typeof isActive === "boolean") {
//       user.isActive = isActive;
//     }

//     await user.save();
//     res.status(200).json({ message: "User updated", user });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.updateUser = async (req, res) => {
//   console.log("REQ FILE:", req.file);
//   try {
//     const userId = req.params.id;
//     const updates = req.body;

//     // Find user
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // ✅ Handle avatar upload
//     if (req.file) {
//       // Upload new image to Cloudinary
//       const uploadResult = await cloudinary.uploader.upload(req.file.path, {
//         folder: "avatars",
//         width: 300,
//         crop: "scale",
//       });

//       // Delete temp file from uploads/
//       fs.unlinkSync(req.file.path);

//       // ✅ Optional: Delete previous avatar from Cloudinary
//       if (user.avatar && user.avatar.public_id) {
//         await cloudinary.uploader.destroy(user.avatar.public_id);
//       }

//       // Update avatar field
//       updates.avatar = {
//         public_id: uploadResult.public_id,
//         url: uploadResult.secure_url,
//       };
//     }

//     // ✅ Update other fields
//     Object.assign(user, updates);
//     await user.save();

//     res.status(200).json({
//       message: "User updated successfully",
//       user,
//     });
//   } catch (err) {
//     console.error("Update Error:", err);
//     res.status(500).json({ message: "Something went wrong while updating user" });
//   }
// };

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    console.log("REQ FILE:", req.file); // 🔍 Debug multer
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.file) {
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
        width: 300,
        crop: "scale",
      });

      fs.unlinkSync(req.file.path);

      if (user.avatar && user.avatar.public_id) {
        await cloudinary.uploader.destroy(user.avatar.public_id);
      }

      updates.avatar = {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url,
      };

      console.log("Updated Avatar:", updates.avatar); // 🔍 Debug avatar
    }

    // Safer object update
    Object.entries(updates).forEach(([key, value]) => {
      user[key] = value;
    });

    await user.save();

    res.status(200).json({
      message: "User updated successfully",
      user,
    });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: "Something went wrong while updating user" });
  }
};

// === DELETE USER (soft delete) ===
// exports.deleteUser = async (req, res, next) => {
//   try {
//     const updatedUser = await User.findByIdAndUpdate(
//       req.params.id,
//       { deleted: true }, // or { isDeleted: true }
//       { new: true }
//     );
//     if (!updatedUser) {
//       return res.status(404).json({ message: "User not found" });
//     }
//     res.status(200).json({ message: "User deactivated successfully" });
//   } catch (err) {
//     next(err);
//   }
// };

// === DELETE USER (Hard delete) ===
exports.deleteUser = async (req, res, next) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// === TOGGLE ACTIVE/INACTIVE ===
exports.toggleActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({ message: `User is now ${user.isActive ? "active" : "inactive"}` });
  } catch (err) {
    next(err);
  }
};

// === GET ALL USERS (Search, Pagination, Filter) ===
// exports.getAllUsers = async (req, res, next) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       search = "",
//       sort = "createdAt",
//       role,
//       active,
//     } = req.query;

//     const query = {
//       deleted: false,
//       name: { $regex: search, $options: "i" },
//     };

//     if (role) query.role = role;
//     if (active !== undefined) query.isActive = active === "true";

//     // If company role — restrict to own users
//     if (req.user.role === "company") query.company = req.user._id;

//     const total = await User.countDocuments(query);
//     const users = await User.find(query)
//       .sort({ [sort]: -1 })
//       .skip((page - 1) * limit)
//       .limit(parseInt(limit));

//     res.status(200).json({ total, page, users });
//   } catch (err) {
//     next(err);
//   }
// };
exports.getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      sort = "createdAt",
      role,
      active,
    } = req.query;

    const query = { deleted: false };

    // 👇 Add search only if present
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    // 👇 Filter by role if passed
    if (role) query.role = role;

    // 👇 Filter by active status only if defined
    if (active === "true") query.isActive = true;
    else if (active === "false") query.isActive = false;

    // 👇 Restrict company users
    if (req.user.role === "company") {
      query.company = req.user._id;
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ [sort]: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({ total, page: parseInt(page), users });
  } catch (err) {
    console.error("Get All Users Error:", err);
    next(err);
  }
};

// === GET SINGLE USER ===
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// === EXPORT USER DATA IN PDF ===
exports.exportUserDataPDF = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const doc = new PDFDocument();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="user-${user._id}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).text("User Data Report", { align: "center" });
    doc.moveDown();
    doc.text(`Name: ${user.name}`);
    doc.text(`Email: ${user.email}`);
    doc.text(`Role: ${user.role}`);
    doc.text(`Active: ${user.isActive}`);
    doc.text(`Verified: ${user.isVerified}`);
    doc.moveDown();
    doc.fontSize(16).text("Survey Stats:");
    doc.text(`Total Surveys Taken: ${user.surveyStats.totalSurveysTaken}`);
    doc.text(`Total Responses: ${user.surveyStats.totalResponses}`);
    doc.text(`Average Score: ${user.surveyStats.averageScore}`);

    doc.end();
  } catch (err) {
    next(err);
  }
};

// === SEND NOTIFICATION EMAIL TO USER ===
exports.sendNotification = async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await sendEmail({
      to: user.email,
      subject,
      html: `<p>${message}</p>`,
    });

    res.status(200).json({ message: "Notification email sent" });
  } catch (err) {
    next(err);
  }
};

// controllers/userController.js
exports.updateMe = async (req, res, next) => {
  try {
    const updates = [
      "name",
      "email",
      "phone",
      "department",
      "bio",
      "timezone",
      "language"
    ];

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    updates.forEach(field => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    await user.save();
    res.status(200).json({ message: "Profile updated", user });
  } catch (err) {
    next(err);
  }
};

