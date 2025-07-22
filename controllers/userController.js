const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../utils/cloudinary");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

// === CREATE USER ===
// exports.createUser = async (req, res, next) => {
//   try {
//     const { name, email, password, role } = req.body;

//     const userExists = await User.findOne({ email });
//     if (userExists) return res.status(400).json({ message: "User already exists" });

//     const hashedPassword = await bcrypt.hash(password, 12);

//     const activeFlag = isActive === true || isActive === "true";

//     const user = await User.create({
//       name,
//       email,
//       password: hashedPassword,
//       role,
//       createdBy: req.user._id,
//       company: req.user.role === "company" ? req.user._id : undefined,
//     });

//     res.status(201).json({ message: "User created", user });
//   } catch (err) {
//     next(err);
//   }
// };

exports.createUser = async (req, res, next) => {
  try {
    // 1. Destructure isActive from req.body
    const { name, email, password, role, isActive } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Remove the problematic activeFlag line, as isActive is now directly from req.body
    // const activeFlag = isActive === true || isActive === "true";

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      // 2. Pass isActive to the create method
      // Mongoose will automatically handle the boolean value.
      // If isActive is undefined from req.body, the schema default (false) will apply.
      // If isActive is explicitly false from req.body, it will be set to false.
      // If isActive is explicitly true from req.body, it will be set to true.
      isActive: isActive,
      createdBy: req.user._id, // Assuming req.user is populated by authentication middleware
      company: req.user.role === "company" ? req.user._id : undefined,
    });

    res.status(201).json({ message: "User created", user });
  } catch (err) {
    console.error("Error creating user:", err); // Log the error for debugging
    next(err); // Pass the error to your error handling middleware
  }
};

// === UPDATE USER ===
exports.updateUser = async (req, res, next) => {
  try {
    const { name, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.file) {
      if (user.avatar?.public_id)
        await cloudinary.uploader.destroy(user.avatar.public_id);

      const uploaded = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
      });

      user.avatar = {
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      };
    }

    if (name) user.name = name;
    if (role) user.role = role;

    await user.save();
    res.status(200).json({ message: "User updated", user });
  } catch (err) {
    next(err);
  }
};

// === DELETE USER (soft delete) ===
exports.deleteUser = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id);
    res.status(200).json({ message: "User deleted" });
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

