// const User = require("../models/User");
// const OTP = require("../models/OTP");
// const sendEmail = require("../utils/sendEmail");
// const cloudinary = require("../utils/cloudinary");
// const PDFDocument = require("pdfkit");
// const fs = require("fs");
// // const path = require("path");
// const bcrypt = require("bcryptjs");
// const moment = require("moment");
// const getBaseURL = require("../utils/getBaseURL");

// // === Helper: Generate OTP Code ===
// const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// exports.createUser = async (req, res, next) => {
//   try {
//     const { name, email, password, role, isActive, department } = req.body;

//     if (!name || !email || !password) {
//       return res.status(400).json({ message: "Name, email, and password are required" });
//     }

//     // Prevent unauthorized role assignment
//     let allowedRoles = [];

//     if (req.user.role === "admin") {
//       allowedRoles = ["companyAdmin", "user"];
//     } else if (req.user.role === "companyAdmin") {
//       allowedRoles = ["member"];
//     } else if (req.user.role === "member") {
//       if (req.user.permissions?.includes("create_member")) {
//         allowedRoles = ["member"];
//       }
//     }

//     if (!allowedRoles.includes(role)) {
//       return res.status(403).json({ message: "You are not allowed to assign this role" });
//     }

//     // Check for duplicate email
//     const userExists = await User.findOne({ email });
//     if (userExists) {
//       return res.status(400).json({ message: "User already exists" });
//     }

//     const hashedPassword = await bcrypt.hash(password, 12);

//     const user = await User.create({
//       name,
//       email,
//       password: hashedPassword,
//       role,
//       department,
//       isActive,
//       isVerified: false, // ensure user starts unverified
//       createdBy: req.user._id,
//       company: role === "member" && req.user.role === "companyAdmin" ? req.user._id : undefined,
//     });

//     // Generate verification token
//     const verificationCode = generateOTP();
//     const expiresAt = moment()
//       .add(process.env.OTP_EXPIRE_MINUTES, "minutes")
//       .toDate();

//     await OTP.create({
//       email: user.email,
//       code: verificationCode,
//       purpose: "verify",
//       expiresAt,
//     });

//     // Base URLs
//     const baseURLs = getBaseURL();
//     const baseURL = role === "user" ? baseURLs.public : baseURLs.admin;

//     // Verification link
//     const verificationLink = `${baseURL}/verify-email?code=${verificationCode}&email=${encodeURIComponent(user.email)}`;

//     const emailHTML = `
//       <p>Hello ${name},</p>
//       <p>Your account has been successfully created.</p>
//       <p><strong>Login Email:</strong> ${email}</p>
//       <p><strong>Temporary Password:</strong> ${password}</p>
//       <p>Please verify your email by clicking the link below:</p>
//       <p><a href="${verificationLink}" target="_blank">${verificationLink}</a></p>
//       <p>This code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
//       <br/>
//       <p>Regards,<br/>Team</p>
//     `;

//     // Send email
//     await sendEmail({
//       to: email,
//       subject: "Verify Your Email",
//       html: emailHTML,
//     });

//     const userObj = user.toObject();
//     delete userObj.password;

//     res.status(201).json({ message: "User created. Verification link sent to email.", user: userObj });
//   } catch (err) {
//     console.error("Error creating user:", err);
//     next(err);
//   }
// };

// // === UPDATE USER ===
// exports.updateUser = async (req, res) => {
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

// // === DELETE USER (soft delete) ===
// exports.deleteUser = async (req, res, next) => {
//   try {
//     const targetUser = await User.findById(req.params.id);
//     if (!targetUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     const currentUser = req.user;

//     // 🔐 Admin can delete anyone
//     if (currentUser.role === "admin") {
//       // Delete avatar if present
//       if (targetUser.avatar?.public_id) {
//         await cloudinary.uploader.destroy(targetUser.avatar.public_id);
//       }

//       // If deleting a companyAdmin, delete its members first
//       if (targetUser.role === "companyAdmin") {
//         const companyMembers = await User.find({ company: targetUser._id });

//         for (const member of companyMembers) {
//           if (member.avatar?.public_id) {
//             await cloudinary.uploader.destroy(member.avatar.public_id);
//           }
//         }

//         await User.deleteMany({ company: targetUser._id });
//       }

//       await User.findByIdAndDelete(targetUser._id);
//       return res.status(200).json({ message: "User deleted successfully" });
//     }

//     // 🏢 Company Admin deleting their own member
//     if (currentUser.role === "companyAdmin" && targetUser.role === "member") {
//       if (targetUser.company?.toString() !== currentUser._id.toString()) {
//         return res.status(403).json({ message: "You can only delete your own members" });
//       }

//       if (targetUser.avatar?.public_id) {
//         await cloudinary.uploader.destroy(targetUser.avatar.public_id);
//       }

//       await User.findByIdAndDelete(targetUser._id);
//       return res.status(200).json({ message: "Member deleted successfully" });
//     }

//     // 👥 Member trying to delete another member WITH permission
//     if (currentUser.role === "member" && targetUser.role === "member") {
//       if (
//         targetUser.company?.toString() === currentUser.company?.toString() &&
//         currentUser.canDeleteMembers // 👈 boolean permission field in DB
//       ) {
//         if (targetUser.avatar?.public_id) {
//           await cloudinary.uploader.destroy(targetUser.avatar.public_id);
//         }

//         await User.findByIdAndDelete(targetUser._id);
//         return res.status(200).json({ message: "Member deleted successfully" });
//       } else {
//         return res.status(403).json({ message: "Not authorized to delete this member" });
//       }
//     }

//     // ❌ Public user or any other invalid case
//     return res.status(403).json({ message: "Not authorized to perform this action" });

//   } catch (err) {
//     console.error("Delete Error:", err);
//     next(err);
//   }
// };

// // === TOGGLE ACTIVE/INACTIVE ===
// exports.toggleActive = async (req, res, next) => {
//   try {
//     const currentUser = req.user;
//     const targetUser = await User.findById(req.params.id);

//     if (!targetUser) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // 🔒 Restrict companyAdmin to only toggle their own members
//     if (
//       currentUser.role === "companyAdmin" &&
//       (targetUser.role !== "member" || targetUser.company?.toString() !== currentUser._id.toString())
//     ) {
//       return res.status(403).json({ message: "You can only toggle your own members" });
//     }

//     // 🚦 Toggle target's isActive
//     targetUser.isActive = !targetUser.isActive;
//     await targetUser.save();

//     let affectedMembers = [];

//     // 🔁 Cascade toggle if admin is deactivating/activating a companyAdmin
//     if (currentUser.role === "admin" && targetUser.role === "companyAdmin") {
//       affectedMembers = await User.updateMany(
//         { company: targetUser._id, role: "member" },
//         { $set: { isActive: targetUser.isActive } }
//       );
//     }

//     res.status(200).json({
//       message: `User is now ${targetUser.isActive ? "active" : "inactive"}`,
//       cascade: affectedMembers.modifiedCount || 0,
//     });

//   } catch (err) {
//     console.error("Toggle Active Error:", err);
//     next(err);
//   }
// };

// // === GET ALL USERS (Search, Pagination, Filter) ===
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

//     // 🔍 Search by name, email (optional)
//     if (search) {
//       query.$or = [
//         { name: { $regex: search, $options: "i" } },
//         { email: { $regex: search, $options: "i" } },
//       ];
//     }

//     // 🎭 Filter by role
//     if (role) query.role = role;

//     // 🔘 Filter by active/inactive
//     if (active === "true") query.isActive = true;
//     else if (active === "false") query.isActive = false;

//     // 🏢 Multi-tenant company-based restriction
//     if (req.user.role === "companyAdmin") {
//       query.company = req.user._id;
//     }

//     // ❗ Optionally hide system admins from being listed
//     if (req.user.role !== "admin") {
//       query.role = { $ne: "admin" };
//     }

//     // 📊 Pagination and results
//     const total = await User.countDocuments(query);
//     const users = await User.find(query)
//       .sort({ [sort]: -1 })
//       .skip((page - 1) * limit)
//       .limit(parseInt(limit));

//     const totalPages = Math.ceil(total / limit);

//     res.status(200).json({
//       total,
//       totalPages,
//       page: parseInt(page),
//       limit: parseInt(limit),
//       users,
//     });

//   } catch (err) {
//     console.error("Get All Users Error:", err);
//     next(err);
//   }
// };

// // === GET SINGLE USER ===
// exports.getUserById = async (req, res, next) => {
//   try {
//     const user = await User.findById(req.params.id)
//       .select("-password")
//       .populate({
//         path: "company",
//         select: "name companyProfile.name companyProfile.departments",
//       });

//     if (!user) return res.status(404).json({ message: "User not found" });

//     res.json({ success: true, user });
//   } catch (err) {
//     next(err);
//   }
// };

// // === EXPORT USER DATA IN PDF ===
// exports.exportUserDataPDF = async (req, res, next) => {
//   try {
//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     const doc = new PDFDocument();

//     res.setHeader("Content-Type", "application/pdf");
//     res.setHeader("Content-Disposition", `attachment; filename="user-${user._id}.pdf"`);

//     doc.pipe(res);

//     doc.fontSize(20).text("User Data Report", { align: "center" });
//     doc.moveDown();
//     doc.text(`Name: ${user.name}`);
//     doc.text(`Email: ${user.email}`);
//     doc.text(`Role: ${user.role}`);
//     doc.text(`Active: ${user.isActive}`);
//     doc.text(`Verified: ${user.isVerified}`);
//     doc.moveDown();
//     // Company Info
//     if (user.company) {
//       doc.fontSize(16).text("Company Info:", { underline: true });
//       doc.fontSize(14);
//       doc.text(`Company Name: ${user.company.name}`);
//       doc.text(`Company Email: ${user.company.email}`);
//       const departments = user.company.companyProfile?.departments || [];
//       doc.text(`Departments: ${departments.length > 0 ? departments.join(", ") : "None"}`);
//       doc.moveDown();
//     }

//     // Survey Stats
//     const stats = user.surveyStats || {};
//     doc.fontSize(16).text("Survey Stats:", { underline: true });
//     doc.fontSize(14);
//     doc.text(`Total Surveys Taken: ${stats.totalSurveysTaken || 0}`);
//     doc.text(`Total Responses: ${stats.totalResponses || 0}`);
//     doc.text(`Average Score: ${stats.averageScore || 0}`);

//     doc.end();
//   } catch (err) {
//     next(err);
//   }
// };

// // === SEND NOTIFICATION EMAIL TO USER ===
// exports.sendNotification = async (req, res, next) => {
//   try {
//     const { subject, message } = req.body;
//     const user = await User.findById(req.params.id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     await sendEmail({
//       to: user.email,
//       subject,
//       html: `<p>${message}</p>`,
//     });

//     res.status(200).json({ message: "Notification email sent" });
//   } catch (err) {
//     next(err);
//   }
// };

// // controllers/userController.js
// exports.updateMe = async (req, res, next) => {
//   try {
//     const updates = [
//       "name",
//       "email",
//       "phone",
//       "department",
//       "bio",
//     ];

//     const user = await User.findById(req.user._id);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Regular fields update
//     updates.forEach((field) => {
//       if (req.body[field] !== undefined) {
//         user[field] = req.body[field];
//       }
//     });

//     // Company profile update (only if user is company)
//     if (req.body.companyProfile && user.role === "companyAdmin") {
//       const company = req.body.companyProfile;

//       user.companyProfile = {
//         ...user.companyProfile, // Preserve existing values
//         name: company.name ?? user.companyProfile?.name ?? "",
//         address: company.address ?? user.companyProfile?.address ?? "",
//         contactEmail: company.contactEmail ?? user.companyProfile?.contactEmail ?? "",
//         contactPhone: company.contactPhone ?? user.companyProfile?.contactPhone ?? "",
//         website: company.website ?? user.companyProfile?.website ?? "",
//         totalEmployees: parseInt(company.totalEmployees ?? user.companyProfile?.totalEmployees ?? 0),
//         departments: Array.isArray(company.departments)
//           ? company.departments
//           : user.companyProfile?.departments ?? [],
//       };
//     }

//     await user.save();
//     res.status(200).json({ message: "Profile updated successfully", user });
//   } catch (err) {
//     next(err);
//   }
// };
const mongoose = require("mongoose");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const OTP = require("../models/OTP");
const Department = require("../models/Department")
const Permission = require("../models/Permission");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../utils/cloudinary");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const moment = require("moment");
const Joi = require("joi");
const getBaseURL = require("../utils/getBaseURL");

// Helper: Generate OTP Code
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Validation Schemas
const createUserSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  role: Joi.string().valid("admin", "companyAdmin", "member", "user").default("user"),
  tenant: Joi.string().hex().length(24).optional(),
  department: Joi.string().hex().length(24).optional(),
  isActive: Joi.boolean().default(true),
  companyName: Joi.string().when("role", {
    is: "companyAdmin",
    then: Joi.string().required(),
    otherwise: Joi.forbidden(),
  }),
});

const updateUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  bio: Joi.string().optional(),
  department: Joi.string().optional(),
  isActive: Joi.boolean().optional(),
  avatar: Joi.object({
    public_id: Joi.string(),
    url: Joi.string(),
  }).optional(),
  role: Joi.string().valid("admin", "companyAdmin", "member").optional(),
  companyName: Joi.string().min(2).max(100).optional(),
});

const getAllUsersSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().allow("").optional(), // Allow empty string or undefined
  sort: Joi.string().default("createdAt"),
  role: Joi.string().valid("admin", "companyAdmin", "member", "user").allow("").optional(),
  active: Joi.string().valid("true", "false").optional(),
});

const idSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

const notificationSchema = Joi.object({
  subject: Joi.string().required(),
  message: Joi.string().required(),
});

const updateMeSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  bio: Joi.string().optional(),
  department: Joi.string().optional(),
  tenant: Joi.object({
    name: Joi.string().optional(),
    address: Joi.string().optional(),
    contactEmail: Joi.string().email().optional(),
    contactPhone: Joi.string().optional(),
    website: Joi.string().optional(),
    totalEmployees: Joi.number().integer().min(0).optional(),
    departments: Joi.array().items(Joi.string()).optional(),
  }).optional(),
});

exports.createUser = async (req, res) => {
  try {
    console.log('===== CREATE USER START =====', { url: req.originalUrl, body: req.body, userId: req.user._id });
    console.log('Req.body:', req.body);
    console.log('LoggedIn User:', {
      id: req.user._id,
      role: req.user.role,
      tenant: req.user.tenant ? req.user.tenant._id?.toString() : req.user.tenant,
    });

    const { name, email, password, role, tenant, department, companyName } = req.body;
    const currentUser = req.user;

    // Duplicate email check
    const existingUser = await User.findOne({ email });
    console.log('ExistingUser:', existingUser ? existingUser._id : 'none');
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    // Role-based creation rules
    console.log('Role check: currentUser.role =', currentUser.role, '| requested role =', role);
    if (currentUser.role === 'admin' && !['companyAdmin', 'user'].includes(role)) {
      return res.status(403).json({ message: 'Admin can only create CompanyAdmin or User.' });
    }

    if (currentUser.role === 'companyAdmin' && role !== 'member') {
      return res.status(403).json({ message: 'CompanyAdmin can only create Member role.' });
    }

    if (currentUser.role === 'member') {
      console.log('Fetching customRoles for member:', currentUser._id);
      const userWithRoles = await User.findById(currentUser._id).populate({
        path: 'customRoles',
        match: { isActive: true, deleted: false },
        populate: { path: 'permissions', select: 'name' },
      });

      console.log('userWithRoles.customRoles:', JSON.stringify(userWithRoles.customRoles, null, 2));

      const hasPermission = userWithRoles.customRoles?.some((role) =>
        role.permissions.some((perm) => perm.name === 'user:create')
      );

      console.log('Member has createUser permission?', hasPermission);

      if (!hasPermission) {
        return res.status(403).json({ message: 'Permission denied: You cannot create users.' });
      }

      if (role !== 'member') {
        return res.status(403).json({ message: 'Members can only create other Members.' });
      }
    }

    // Tenant validation
    let tenantId = tenant;
    if (currentUser.role === 'companyAdmin' && role === 'member') {
      if (!currentUser.tenant) {
        console.log('createUser: No tenant found for currentUser', { userId: currentUser._id });
        return res.status(403).json({ message: 'Access denied: No tenant associated with this user' });
      }
      const userTenantId = currentUser.tenant._id ? currentUser.tenant._id.toString() : currentUser.tenant;
      console.log('Tenant Validation:', { providedTenant: tenant, userTenantId });

      if (!tenant) {
        tenantId = userTenantId;
        console.log('Tenant auto-injected:', tenantId);
      } else if (tenant !== userTenantId) {
        console.log('createUser: Tenant mismatch', { providedTenant: tenant, userTenantId });
        return res.status(403).json({ message: 'Access denied: Invalid tenant' });
      }
    }

    // Validate department belongs to tenant
    if (role === 'member' && department) {
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        console.log('createUser: Invalid tenantId', { tenantId });
        return res.status(400).json({ message: 'Invalid tenant ID' });
      }
      const tenantData = await Tenant.findById(tenantId).populate('departments');
      console.log(
        'TenantData Departments:',
        tenantData ? tenantData.departments.map((d) => d._id.toString()) : 'No tenant found'
      );

      if (!tenantData || !tenantData.departments.some((d) => d._id.toString() === department)) {
        console.log('createUser: Invalid department', { department, tenantId });
        return res.status(400).json({ message: 'Invalid department for this tenant' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    let newUser;
    if (role === 'companyAdmin') {
      console.log('Creating companyAdmin user with tenant...');
      const tempUser = new User({
        name,
        email,
        password: hashedPassword,
        role,
        tenant: null,
        department: null,
        isVerified: false,
        createdBy: currentUser._id,
      });

      await tempUser.save({ validateBeforeSave: false });

      const newTenant = await Tenant.create({
        name: companyName || `${name}'s Company`,
        admin: tempUser._id,
        createdBy: currentUser._id,
      });

      tempUser.tenant = newTenant._id;
      await tempUser.save();

      newUser = tempUser;
      tenantId = newTenant._id;

      console.log('New CompanyAdmin + Tenant Created:', { tenantId, userId: newUser._id });
    } else {
      if (role === 'member') {
        console.log('Creating Member with tenantId:', tenantId);
      }

      newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role,
        tenant: tenantId,
        department: role === 'member' ? department : null,
        isVerified: false,
        createdBy: currentUser._id,
      });

      console.log('New User Created:', { userId: newUser._id, role: newUser.role, tenant: newUser.tenant });
    }

    // OTP
    const verificationCode = generateOTP();
    const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES || 15, 'minutes').toDate();
    await OTP.create({ email, code: verificationCode, purpose: 'verify', expiresAt });

    const baseURLs = getBaseURL();
    const baseURL = role === 'user' ? baseURLs.public : baseURLs.admin;
    const verificationLink = `${baseURL}/verify-email?code=${verificationCode}&email=${encodeURIComponent(email)}`;

    console.log('Verification Link:', verificationLink);

    await sendEmail({
      to: email,
      subject: 'Verify your email - RatePro',
      html: `<p>Verify here: <a href="${verificationLink}">${verificationLink}</a></p>`,
    });

    console.log('Email sent successfully!');

    res.status(201).json({
      message: 'User created successfully. Verification email sent.',
      user: {
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
        tenant: newUser.tenant,
        isVerified: newUser.isVerified,
      },
    });

    console.log('===== CREATE USER END =====');
  } catch (err) {
    console.error('CreateUser error:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    let updates = { ...req.body };

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ----- ROLE BASED FIELD CONTROL -----
    if (req.user.role === "admin") {
      const allowedFields = ["name", "role", "isActive", "companyName"];
      Object.keys(updates).forEach((key) => {
        if (!allowedFields.includes(key)) delete updates[key];
      });
    } else if (req.user.role === "companyAdmin") {
      const allowedFields = ["name", "isActive", "department"];
      Object.keys(updates).forEach((key) => {
        if (!allowedFields.includes(key)) delete updates[key];
      });
    } else if (req.user.role === "member") {
      const allowedFields = ["name", "isActive"];
      Object.keys(updates).forEach((key) => {
        if (!allowedFields.includes(key)) delete updates[key];
      });
    }

    // ----- ISACTIVE LOGIC (direct update allowed) -----
    if (typeof updates.isActive !== "undefined") {
      console.log("⚡ isActive Update Detected:", updates.isActive);
      if (!updates.isActive) {
        updates.deactivatedBy = req.user.role; // jisne deactivate kiya
      } else {
        updates.deactivatedBy = null; // reactivate hone pe clear
      }
    }

    // ----- UPDATE USER -----
    const updatedUser = await User.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.status(200).json({
      status: "success",
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("❌ UpdateUser Error:", error.message);
    next(error);
  }
};

// exports.deleteUser = async (req, res, next) => {
//   try {
//     const { error } = idSchema.validate(req.params);
//     if (error) return res.status(400).json({ message: error.details[0].message });

//     const targetUser = await User.findById(req.params.id);
//     if (!targetUser) return res.status(404).json({ message: "User not found" });

//     // Tenant scoping
//     if (req.user.role !== "admin" && targetUser.tenant && req.tenantId !== targetUser.tenant.toString()) {
//       return res.status(403).json({ message: "Access denied: Wrong tenant" });
//     }

//     // Role-based checks
//     if (req.user.role === "companyAdmin" && targetUser.role !== "member") {
//       return res.status(403).json({ message: "CompanyAdmin can only delete members" });
//     }
//     if (req.user.role === "member") {
//       const currentUser = await User.findById(req.user._id).populate({
//         path: "customRoles",
//         populate: { path: "permissions" },
//       });
//       const hasDeletePermission = currentUser.customRoles.some(role =>
//         role.permissions.some(perm => perm.name === "user:delete")
//       );
//       if (!hasDeletePermission || targetUser.role !== "member") {
//         return res.status(403).json({ message: "Not authorized to delete this user" });
//       }
//     }

//     // Delete avatar
//     if (targetUser.avatar?.public_id) {
//       await cloudinary.uploader.destroy(targetUser.avatar.public_id);
//     }

//     // Soft delete
//     await User.findByIdAndUpdate(targetUser._id, { deleted: true });

//     // Cascade soft delete for companyAdmin's members
//     if (req.user.role === "admin" && targetUser.role === "companyAdmin") {
//       await User.updateMany({ tenant: targetUser._id, role: "member" }, { deleted: true });
//     }

//     res.status(200).json({ message: "User deleted successfully" });
//   } catch (err) {
//     console.error("Delete Error:", err);
//     next(err);
//   }
// };

exports.deleteUser = async (req, res, next) => {
  try {
    const { error } = idSchema.validate(req.params);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ message: "User not found" });

    // Tenant scoping
    if (req.user.role !== "admin" && targetUser.tenant && req.tenantId !== targetUser.tenant.toString()) {
      return res.status(403).json({ message: "Access denied: Wrong tenant" });
    }

    // Role-based checks
    if (req.user.role === "companyAdmin" && targetUser.role !== "member") {
      return res.status(403).json({ message: "CompanyAdmin can only delete members" });
    }
    if (req.user.role === "member") {
      const currentUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });
      const hasDeletePermission = currentUser.customRoles.some(role =>
        role.permissions.some(perm => perm.name === "user:delete")
      );
      if (!hasDeletePermission || targetUser.role !== "member") {
        return res.status(403).json({ message: "Not authorized to delete this user" });
      }
    }

    // Delete avatar from cloudinary
    if (targetUser.avatar?.public_id) {
      await cloudinary.uploader.destroy(targetUser.avatar.public_id);
    }

    // --- Hard Delete ---
    if (req.user.role === "admin" && targetUser.role === "companyAdmin") {
      // 1) Delete members of this companyAdmin's tenant
      await User.deleteMany({ tenant: targetUser.tenant, role: "member" });

      // 2) Delete departments of this tenant
      await Department.deleteMany({ tenant: targetUser.tenant });

      // 3) Delete tenant itself
      await Tenant.findByIdAndDelete(targetUser.tenant);

      // 4) Delete the companyAdmin
      await User.findByIdAndDelete(targetUser._id);
    } else {
      // Normal user delete
      await User.findByIdAndDelete(targetUser._id);
    }

    res.status(200).json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete Error:", err);
    next(err);
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const { id  } = req.params;
    const targetUser = await User.findById(id);

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // --- Toggle ---
    targetUser.isActive = !targetUser.isActive;

    // --- Set deactivatedBy / activatedBy ---
    if (!targetUser.isActive) {
      targetUser.deactivatedBy = req.user.role; // jisne deactivate kiya
    } else {
      targetUser.deactivatedBy = null; // activate hone par clear
    }

    await targetUser.save();

    let cascadeResult = null;

    // ============ Cascade Logic ============
    // 1. ADMIN deactivates COMPANY ADMIN → affect all tenant members
    if (req.user.role === "admin" && targetUser.role === "companyAdmin") {
      if (!targetUser.isActive) {
        // deactivate all active members of tenant
        cascadeResult = await User.updateMany(
          { tenant: targetUser.tenant, role: "member", isActive: true },
          { $set: { isActive: false, deactivatedBy: "admin" } }
        );
      } else {
        // reactivate only those members that were deactivated by ADMIN (not companyAdmin)
        cascadeResult = await User.updateMany(
          { tenant: targetUser.tenant, role: "member", deleted: false, deactivatedBy: "admin" },
          { $set: { isActive: true, deactivatedBy: null } }
        );
      }
    }

    // 2. COMPANY ADMIN deactivates a MEMBER
    if (req.user.role === "companyAdmin" && targetUser.role === "member") {
      if (!targetUser.isActive) {
        targetUser.deactivatedBy = "companyAdmin";
      } else {
        targetUser.deactivatedBy = null;
      }
      await targetUser.save();
    }

    res.json({
      message: `User ${targetUser.isActive ? "activated" : "deactivated"} successfully`,
      user: targetUser,
      cascade: cascadeResult,
    });
  } catch (error) {
    console.error("toggleActive error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.getAllUsers = async (req, res, next) => {
  try {
    const { error, value } = getAllUsersSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { page, limit, search, sort, role, active } = value;

    const query = { deleted: false };

    // 🔍 Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // 🎭 Role filter
    if (role) {
      query.role = role;
    }

    // ✅ Active/Inactive filter
    if (active === "true") {
      query.isActive = true;
    } else if (active === "false") {
      query.isActive = false;
    }

    // 🏢 Tenant scoping
    if (req.user.role.toLowerCase() !== "admin") {
      if (req.tenantId) {
        query.tenant = req.tenantId;
        // Non-admins should not see admins
        query.role = { $ne: "admin" };
        console.log("🏢 Tenant scoping applied for non-admin:", req.tenantId);
      } else {
        console.log("🚫 Access denied: No tenant for non-admin user");
        return res.status(403).json({
          message: "Access denied: No tenant associated with this user",
        });
      }
    } 

    const total = await User.countDocuments(query);

    const users = await User.find(query)
      .select("-password")
      .populate("tenant customRoles department")
      .sort({ [sort]: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({
      total,
      totalPages: Math.ceil(total / limit),
      page: parseInt(page),
      limit: parseInt(limit),
      users,
    });
  } catch (err) {
    console.error("❌ Get All Users Error:", err);
    next(err);
  }
};

exports.getUserById = async (req, res, next) => {
  try {
    const { error } = idSchema.validate(req.params);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate({
        path: "tenant",
        populate: { path: "departments" }, // Populate tenant.departments
      })
      .populate("customRoles department");

    if (!user) return res.status(404).json({ message: "User not found" });

    // console.log('getUserById: User data', {
    //   userId: req.params.id,
    //   departmentId: user.department?._id?.toString(),
    //   departmentName: user.department?.name,
    //   tenantId: user.tenant?._id?.toString(),
    //   tenantDepartments: user.tenant?.departments?.map(d => ({
    //     id: d._id?.toString(),
    //     name: d.name,
    //   })),
    // });

    if (req.user.role !== "admin" && user.tenant && req.tenantId !== user.tenant._id.toString()) {
      return res.status(403).json({ message: "Access denied: Wrong tenant" });
    }

    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('getUserById error:', { message: err.message, stack: err.stack });
    next(err);
  }
};

exports.exportUserDataPDF = async (req, res, next) => {
  try {
    const { error } = idSchema.validate(req.params);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const user = await User.findById(req.params.id)
      .select("-password")
      .populate("department")
      .populate({
        path: "tenant",
        populate: {
          path: "departments",
          model: "Department",
          select: "name"
        }
      });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Tenant scoping
    if (req.user.role !== "admin" && req.user.role !== "companyAdmin") {
      console.error('exportUserDataPDF: Access denied', {
        requesterRole: req.user.role,
      });
      return res.status(403).json({ message: "Access denied: Insufficient permissions" });
    }

    if (req.user.role !== "admin" && user.tenant && req.tenantId !== user.tenant._id.toString()) {
      console.error('exportUserDataPDF: Access denied', {
        requesterTenant: req.tenantId,
        userTenant: user.tenant._id.toString(),
      });
      return res.status(403).json({ message: "Access denied: Wrong tenant" });
    }

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="user-${user._id}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).text("User Data Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(14);
    doc.text(`Name: ${user.name}`);
    doc.text(`Email: ${user.email}`);
    doc.text(`Role: ${user.role}`);
    doc.text(`Active: ${user.isActive}`);
    doc.text(`Verified: ${user.isVerified}`);
    doc.text(`Department: ${user.department?.name || "N/A"}`);
    doc.moveDown();

    // Tenant Info
    if (user.tenant) {
      doc.fontSize(16).text("Tenant Info:", { underline: true });
      doc.fontSize(14);
      doc.text(`Tenant Name: ${user.tenant.name || "N/A"}`);
      doc.text(`Tenant Email: ${user.tenant.email || "N/A"}`);
      doc.text(`Departments: ${user.tenant.departments?.length > 0 ? user.tenant.departments.map(d => d.name || "N/A").join(", ") : "None"}`);
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
    console.error('exportUserDataPDF error:', { message: err.message, stack: err.stack });
    next(err);
  }
};

exports.sendNotification = async (req, res, next) => {
  try {
    const { error: bodyError } = notificationSchema.validate(req.body);
    const { error: paramError } = idSchema.validate(req.params);
    if (bodyError || paramError) return res.status(400).json({ message: (bodyError || paramError).details[0].message });

    const { subject, message } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Tenant scoping
    if (req.user.role !== "admin" && user.tenant && req.tenantId !== user.tenant.toString()) {
      return res.status(403).json({ message: "Access denied: Wrong tenant" });
    }

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

exports.updateMe = async (req, res, next) => {
  try {
    // ----------------- VALIDATION -----------------
    const { error } = updateMeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    // ----------------- JWT VERIFY -----------------
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // ----------------- FETCH USER -----------------
    const user = await User.findById(userId).populate("tenant");
    if (!user) return res.status(404).json({ message: "User not found" });

    // ----------------- UPDATE USER FIELDS -----------------
    const fieldsToUpdate = ["name", "email", "phone", "bio", "department"];
    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) user[field] = req.body[field];
    });

    // ----------------- TENANT/COMPANY UPDATE (only for companyAdmin) -----------------
    if (req.body.tenant && user.role === "companyAdmin") {
      let tenant = await Tenant.findById(user.tenant?._id);
      if (!tenant) return res.status(404).json({ message: "Tenant not found" });

      const tenantUpdates = req.body.tenant;
      Object.assign(tenant, {
        name: tenantUpdates.name ?? tenant.name,
        address: tenantUpdates.address ?? tenant.address,
        contactEmail: tenantUpdates.contactEmail ?? tenant.contactEmail,
        contactPhone: tenantUpdates.contactPhone ?? tenant.contactPhone,
        website: tenantUpdates.website ?? tenant.website,
        totalEmployees: tenantUpdates.totalEmployees ?? tenant.totalEmployees,
        departments: tenantUpdates.departments ?? tenant.departments,
      });
      await tenant.save();
    }

    // ----------------- AVATAR UPLOAD -----------------
    if (req.file) {
      if (user.avatar?.public_id) {
        await cloudinary.uploader.destroy(user.avatar.public_id);
      }

      const uploadResult = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
        width: 300,
        crop: "scale",
      });
      fs.unlinkSync(req.file.path);
      user.avatar = { public_id: uploadResult.public_id, url: uploadResult.secure_url };
    }

    await user.save();

    // ----------------- SAFE USER OBJECT -----------------
    const safeUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      role: user.role,
      customRoles: user.customRoles,
      authProvider: user.authProvider,
      isActive: user.isActive,
      isVerified: user.isVerified,
      tenant: user.tenant,
      department: user.department,
      avatar: user.avatar,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    res.status(200).json({ message: "Profile updated successfully", user: safeUser });
  } catch (err) {
    console.error("updateMe error:", err);
    next(err);
  }
};
