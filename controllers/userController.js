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
// exports.createUser = async (req, res, next) => {
//   try {
//     const { name, email, password, role, isActive, department } = req.body;

//     // Check if email already exists
//     const userExists = await User.findOne({ email });
//     if (userExists) {
//       return res.status(400).json({ message: "User already exists" });
//     }

//     // Hash password
//     const hashedPassword = await bcrypt.hash(password, 12);

//     // Create new user
//     const user = await User.create({
//       name,
//       email,
//       password: hashedPassword,
//       role,
//       department,
//       isActive, // boolean already handled from frontend
//       createdBy: req.user._id,
//       company: req.user.role === "companyAdmin" ? req.user._id : undefined,
//     });

//     // 🔐 Generate OTP for email verification
//     const otpCode = generateOTP();
//     const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES, "minutes").toDate();

//     await OTP.create({ email, code: otpCode, expiresAt, purpose: "verify" });

//     // 🌐 Determine the baseURL from the request origin
//     const origin = req.headers.origin || "";
//     let source = "public";
//     if (origin.includes("admin") && (role === "admin" || role === "companyAdmin")) {
//       source = "admin";
//     }

//     const urls = getBaseURL();
//     const baseURL = source === "admin" ? urls.admin : urls.public;

//     const link = `${baseURL}/verify-email?code=${otpCode}&email=${email}`;

//     // 📧 Send verification email
//     await sendEmail({
//       to: email,
//       subject: "Verify Your Email",
//       html: `
//         <p>Hello ${name || "user"},</p>
//         <p>Please verify your email address by clicking the link below:</p>
//         <p><a href="${link}">${link}</a></p>
//         <p>This link/code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
//       `,
//     });

//     res.status(201).json({ message: "User created. Verification link sent to email.", user });
//   } catch (err) {
//     console.error("Error creating user:", err);
//     next(err);
//   }
// };

exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, isActive, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    console.log("Logged in user role:", req.user.role);


    // Prevent unauthorized role assignment
    // 🔒 Role assignment logic
    let allowedRoles = [];

    if (req.user.role === "admin") {
      allowedRoles = ["companyAdmin", "user"];
    } else if (req.user.role === "companyAdmin") {
      allowedRoles = ["member"];
    } else if (req.user.role === "member") {
      if (req.user.permissions?.includes("create_member")) {
        allowedRoles = ["member"];
      }
    }

    console.log("Allowed roles:", allowedRoles);

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: "You are not allowed to assign this role" });
    }

    // Check for duplicate email
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      department,
      isActive,
      createdBy: req.user._id,
      company: role === "member" && req.user.role === "companyAdmin" ? req.user._id : undefined,
    });

    // Send verification email
    await sendEmail({
      to: email,
      subject: "Your Account Has Been Created",
      html: `
        <p>Hello ${name},</p>
        <p>Your account has been successfully created.</p>
        <p><strong>Login Email:</strong> ${email}</p>
        <p><strong>Temporary Password:</strong> ${password}</p>
        <p>You can now log in to your dashboard and complete the email verification process.</p>
        <p><a href="${getBaseURL(req)}/login" target="_blank">${getBaseURL(req)}/login</a></p>
    <p>Once on the login page, please enter the email and temporary password provided above.</p>
    <br/>
        <p>Regards,<br/>Team</p>
      `,
    });

    const userObj = user.toObject();
    delete userObj.password;

    res.status(201).json({ message: "User created. Verification link sent to email.", user: userObj });
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

exports.updateUser = async (req, res) => {
  console.log("REQ FILE:", req.file);
  try {
    const userId = req.params.id;
    const updates = req.body;

    // Find user
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ✅ Handle avatar upload
    if (req.file) {
      // Upload new image to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
        width: 300,
        crop: "scale",
      });

      // Delete temp file from uploads/
      fs.unlinkSync(req.file.path);

      // ✅ Optional: Delete previous avatar from Cloudinary
      if (user.avatar && user.avatar.public_id) {
        await cloudinary.uploader.destroy(user.avatar.public_id);
      }

      // Update avatar field
      updates.avatar = {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url,
      };
    }

    // ✅ Update other fields
    Object.assign(user, updates);
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
// exports.deleteUser = async (req, res, next) => {
//   try {
//     const targetUser = await User.findById(req.params.id);
//     if (!targetUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const currentUser = req.user;

//     // 🔐 If admin deleting a companyAdmin
//     if (currentUser.role === "admin" && targetUser.role === "companyAdmin") {
//       // 1. Find all members under this company
//       const companyMembers = await User.find({ company: targetUser._id });

//       // 2. Delete avatars of all members (if any)
//       for (const member of companyMembers) {
//         if (member.avatar?.public_id) {
//           await cloudinary.uploader.destroy(member.avatar.public_id);
//         }
//       }

//       // 3. Delete all members
//       await User.deleteMany({ company: targetUser._id });

//       // 4. Delete companyAdmin's avatar (if exists)
//       if (targetUser.avatar?.public_id) {
//         await cloudinary.uploader.destroy(targetUser.avatar.public_id);
//       }

//       // 5. Delete companyAdmin
//       await User.findByIdAndDelete(targetUser._id);

//       return res.status(200).json({ message: "Company and its members deleted successfully" });

//     } else if (currentUser.role === "companyAdmin" && targetUser.role === "member") {
//       if (targetUser.company?.toString() !== currentUser._id.toString()) {
//         return res.status(403).json({ message: "You can only delete your own members" });
//       }

//       // Delete avatar if present
//       if (targetUser.avatar?.public_id) {
//         await cloudinary.uploader.destroy(targetUser.avatar.public_id);
//       }

//       await User.findByIdAndDelete(targetUser._id);
//       return res.status(200).json({ message: "Member deleted successfully" });

//     } else {
//       return res.status(403).json({ message: "Not authorized to perform this action" });
//     }

//   } catch (err) {
//     console.error("Delete Error:", err);
//     next(err);
//   }
// };

exports.deleteUser = async (req, res, next) => {
  try {
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentUser = req.user;

    // 🔐 Admin can delete anyone
    if (currentUser.role === "admin") {
      // Delete avatar if present
      if (targetUser.avatar?.public_id) {
        await cloudinary.uploader.destroy(targetUser.avatar.public_id);
      }

      // If deleting a companyAdmin, delete its members first
      if (targetUser.role === "companyAdmin") {
        const companyMembers = await User.find({ company: targetUser._id });

        for (const member of companyMembers) {
          if (member.avatar?.public_id) {
            await cloudinary.uploader.destroy(member.avatar.public_id);
          }
        }

        await User.deleteMany({ company: targetUser._id });
      }

      await User.findByIdAndDelete(targetUser._id);
      return res.status(200).json({ message: "User deleted successfully" });
    }

    // 🏢 Company Admin deleting their own member
    if (currentUser.role === "companyAdmin" && targetUser.role === "member") {
      if (targetUser.company?.toString() !== currentUser._id.toString()) {
        return res.status(403).json({ message: "You can only delete your own members" });
      }

      if (targetUser.avatar?.public_id) {
        await cloudinary.uploader.destroy(targetUser.avatar.public_id);
      }

      await User.findByIdAndDelete(targetUser._id);
      return res.status(200).json({ message: "Member deleted successfully" });
    }

    // 👥 Member trying to delete another member WITH permission
    if (currentUser.role === "member" && targetUser.role === "member") {
      if (
        targetUser.company?.toString() === currentUser.company?.toString() &&
        currentUser.canDeleteMembers // 👈 boolean permission field in DB
      ) {
        if (targetUser.avatar?.public_id) {
          await cloudinary.uploader.destroy(targetUser.avatar.public_id);
        }

        await User.findByIdAndDelete(targetUser._id);
        return res.status(200).json({ message: "Member deleted successfully" });
      } else {
        return res.status(403).json({ message: "Not authorized to delete this member" });
      }
    }

    // ❌ Public user or any other invalid case
    return res.status(403).json({ message: "Not authorized to perform this action" });

  } catch (err) {
    console.error("Delete Error:", err);
    next(err);
  }
};

// === TOGGLE ACTIVE/INACTIVE ===
// exports.toggleActive = async (req, res, next) => {
//   try {
//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     user.isActive = !user.isActive;
//     await user.save();

//     res.status(200).json({ message: `User is now ${user.isActive ? "active" : "inactive"}` });
//   } catch (err) {
//     next(err);
//   }
// };

exports.toggleActive = async (req, res, next) => {
  try {
    const currentUser = req.user;
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // 🔒 Restrict companyAdmin to only toggle their own members
    if (
      currentUser.role === "companyAdmin" &&
      (targetUser.role !== "member" || targetUser.company?.toString() !== currentUser._id.toString())
    ) {
      return res.status(403).json({ message: "You can only toggle your own members" });
    }

    // 🚦 Toggle target's isActive
    targetUser.isActive = !targetUser.isActive;
    await targetUser.save();

    let affectedMembers = [];

    // 🔁 Cascade toggle if admin is deactivating/activating a companyAdmin
    if (currentUser.role === "admin" && targetUser.role === "companyAdmin") {
      affectedMembers = await User.updateMany(
        { company: targetUser._id, role: "member" },
        { $set: { isActive: targetUser.isActive } }
      );
    }

    res.status(200).json({
      message: `User is now ${targetUser.isActive ? "active" : "inactive"}`,
      cascade: affectedMembers.modifiedCount || 0,
    });

  } catch (err) {
    console.error("Toggle Active Error:", err);
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
// exports.getAllUsers = async (req, res, next) => {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       search,
//       sort = "createdAt",
//       role,
//       active,
//     } = req.query;

//     const query = { deleted: false };

//     // 👇 Add search only if present
//     if (search) {
//       query.name = { $regex: search, $options: "i" };
//     }

//     // 👇 Filter by role if passed
//     if (role) query.role = role;

//     // 👇 Filter by active status only if defined
//     if (active === "true") query.isActive = true;
//     else if (active === "false") query.isActive = false;

//     // 👇 Restrict company users
//     if (req.user.role === "company") {
//       query.company = req.user._id;
//     }

//     const total = await User.countDocuments(query);
//     const users = await User.find(query)
//       .sort({ [sort]: -1 })
//       .skip((page - 1) * limit)
//       .limit(parseInt(limit));

//     res.status(200).json({ total, page: parseInt(page), users });
//   } catch (err) {
//     console.error("Get All Users Error:", err);
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

    // 🔍 Search by name, email (optional)
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // 🎭 Filter by role
    if (role) query.role = role;

    // 🔘 Filter by active/inactive
    if (active === "true") query.isActive = true;
    else if (active === "false") query.isActive = false;

    // 🏢 Multi-tenant company-based restriction
    if (req.user.role === "companyAdmin") {
      query.company = req.user._id;
    }

    // ❗ Optionally hide system admins from being listed
    if (req.user.role !== "admin") {
      query.role = { $ne: "admin" };
    }

    // 📊 Pagination and results
    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ [sort]: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      total,
      totalPages,
      page: parseInt(page),
      limit: parseInt(limit),
      users,
    });

  } catch (err) {
    console.error("Get All Users Error:", err);
    next(err);
  }
};

// === GET SINGLE USER ===
// exports.getUserById = async (req, res, next) => {
//   try {
//     const user = await User.findById(req.params.id).select("-password");
//     if (!user) return res.status(404).json({ message: "User not found" });
//     res.json({ success: true, user });
//   } catch (err) {
//     next(err);
//   }
// };

exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password")
      .populate({
        path: "company",
        select: "name companyProfile.name companyProfile.departments",
      });

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
    // Company Info
    if (user.company) {
      doc.fontSize(16).text("Company Info:", { underline: true });
      doc.fontSize(14);
      doc.text(`Company Name: ${user.company.name}`);
      doc.text(`Company Email: ${user.company.email}`);
      const departments = user.company.companyProfile?.departments || [];
      doc.text(`Departments: ${departments.length > 0 ? departments.join(", ") : "None"}`);
      doc.moveDown();
    }

    // Survey Stats
    const stats = user.surveyStats || {};
    doc.fontSize(16).text("Survey Stats:", { underline: true });
    doc.fontSize(14);
    doc.text(`Total Surveys Taken: ${stats.totalSurveysTaken || 0}`);
    doc.text(`Total Responses: ${stats.totalResponses || 0}`);
    doc.text(`Average Score: ${stats.averageScore || 0}`);

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
// exports.updateMe = async (req, res, next) => {
//   try {
//     const updates = [
//       "name",
//       "email",
//       "phone",
//       "department",
//       "bio",
//       "timezone",
//       "language"
//     ];

//     const user = await User.findById(req.user._id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     updates.forEach(field => {
//       if (req.body[field] !== undefined) {
//         user[field] = req.body[field];
//       }
//     });

//     if (req.body.companyProfile && user.role === "companyAdmin") {
//       user.companyProfile = {
//         ...user.companyProfile, // optional: preserve existing
//         ...req.body.companyProfile,
//         totalEmployees: parseInt(req.body.companyProfile.totalEmployees || 0),
//         departments: req.body.companyProfile.departments || [],
//       };
//     }

//     await user.save();
//     res.status(200).json({ message: "Profile updated", user });
//   } catch (err) {
//     next(err);
//   }
// };
exports.updateMe = async (req, res, next) => {
  try {
    const updates = [
      "name",
      "email",
      "phone",
      "department",
      "bio",
    ];

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Regular fields update
    updates.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    // Company profile update (only if user is company)
    if (req.body.companyProfile && user.role === "companyAdmin") {
      const company = req.body.companyProfile;

      user.companyProfile = {
        ...user.companyProfile, // Preserve existing values
        name: company.name ?? user.companyProfile?.name ?? "",
        address: company.address ?? user.companyProfile?.address ?? "",
        contactEmail: company.contactEmail ?? user.companyProfile?.contactEmail ?? "",
        contactPhone: company.contactPhone ?? user.companyProfile?.contactPhone ?? "",
        website: company.website ?? user.companyProfile?.website ?? "",
        totalEmployees: parseInt(company.totalEmployees ?? user.companyProfile?.totalEmployees ?? 0),
        departments: Array.isArray(company.departments)
          ? company.departments
          : user.companyProfile?.departments ?? [],
      };
    }

    await user.save();
    res.status(200).json({ message: "Profile updated successfully", user });
  } catch (err) {
    next(err);
  }
};

