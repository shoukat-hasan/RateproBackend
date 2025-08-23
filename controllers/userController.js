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
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  isActive: Joi.boolean().optional(),
  role: Joi.string().valid("admin", "companyAdmin", "member").required(),
  tenantName: Joi.string().min(2).max(100).optional(),
  department: Joi.string().optional(),
  tenant: Joi.string().optional(),
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
  phone: Joi.string().allow("").optional(),
  bio: Joi.string().allow("").optional(),
  department: Joi.string().allow("").optional(),
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
    // Validate request
    const { error } = createUserSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { name, email, password, role, tenant, department, tenantName } = req.body;
    const currentUser = req.user;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }
    if (currentUser.role === 'admin' && !['companyAdmin', 'user'].includes(role)) {
      return res.status(403).json({ message: 'Admin can only create CompanyAdmin or User.' });
    }
    if (currentUser.role === 'companyAdmin' && role !== 'member') {
      return res.status(403).json({ message: 'CompanyAdmin can only create Member role.' });
    }

    // --- Member custom role restrictions ---
    if (currentUser.role === "member") {
      // populate user with customRole and permissions
      const populatedUser = await User.findById(currentUser._id).populate({
        path: "customRoles",
        populate: { path: "permissions" }
      });

      if (!populatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === "user:create")
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied: Permission 'user:create' required" });
      }
    }

    // Tenant validation
    let tenantId = tenant;
    if (currentUser.role === 'companyAdmin' && role === 'member') {
      if (!currentUser.tenant) {
        return res.status(403).json({ message: 'Access denied: No tenant associated with this user' });
      }
      const userTenantId = currentUser.tenant._id ? currentUser.tenant._id.toString() : currentUser.tenant;
      tenantId = tenant || userTenantId;
      if (tenant && tenant !== userTenantId) {
        console.log('Tenant mismatch');
        return res.status(403).json({ message: 'Access denied: Invalid tenant' });
      }
    }

    // Validate department belongs to tenant
    if (role === 'member' && department) {
      if (!mongoose.Types.ObjectId.isValid(tenantId)) {
        return res.status(400).json({ message: 'Invalid tenant ID' });
      }
      const tenantData = await Tenant.findById(tenantId).populate('departments');
      if (!tenantData || !tenantData.departments.some((d) => d._id.toString() === department)) {
        return res.status(400).json({ message: 'Invalid department for this tenant' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    let newUser;

    if (role === 'companyAdmin') {
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
        name: tenantName && tenantName.trim() !== '' ? tenantName : `${name}'s Company`,
        admin: tempUser._id,
        createdBy: currentUser._id,
      });

      tempUser.tenant = newTenant._id;
      await tempUser.save();

      newUser = tempUser;
      tenantId = newTenant._id;

    } else {
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
    }

    // OTP
    const verificationCode = generateOTP();
    const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES || 15, 'minutes').toDate();
    await OTP.create({ email, code: verificationCode, purpose: 'verify', expiresAt });
    console.log('OTP generated:', verificationCode);

    const baseURLs = getBaseURL();
    const baseURL = role === 'user' ? baseURLs.public : baseURLs.admin;
    const verificationLink = `${baseURL}/verify-email?code=${verificationCode}&email=${encodeURIComponent(email)}`;

    // Email HTML
    const emailHTML = `
      <p>Hello ${name},</p>
      <p>Your account has been successfully created.</p>
      <p><strong>Login Email:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> ${password}</p>
      <p>Please verify your email by clicking the link below:</p>
      <p><a href="${verificationLink}" target="_blank">${verificationLink}</a></p>
      <p>This code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
      <br/>
      <p>Regards,<br/>Team</p>
    `;
    await sendEmail({
      to: email,
      subject: 'Verify your email - RatePro',
      html: emailHTML,
    });

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

    // --- Member custom role restrictions ---
    if (req.user.role === "member") {
      // Populate user with customRoles and permissions
      const populatedUser = await User.findById(req.user._id).populate({
        path: "customRoles", // plural
        populate: { path: "permissions" }
      });

      // Check if any custom role has the 'user:update' permission
      const hasPermission = populatedUser?.customRoles?.some((role) =>
        role.permissions.some((p) => p.name === "user:update")
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied: Permission 'user:update' required" });
      }

      // Optional: Tenant validation for member role
      if (user.tenant._id.toString() !== req.user.tenant._id.toString()) {
        return res.status(403).json({ message: "Access denied: Cannot update users from a different tenant" });
      }
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

    let affectedUsers = [];

    // --- Hard Delete ---
    if (req.user.role === "admin" && targetUser.role === "companyAdmin") {
      // 1) Fetch members to return their IDs
      affectedUsers = await User.find({ tenant: targetUser.tenant, role: "member" }).select("_id");
      // 2) Delete members of this companyAdmin's tenant
      await User.deleteMany({ tenant: targetUser.tenant, role: "member" });
      // 3) Delete departments of this tenant
      await Department.deleteMany({ tenant: targetUser.tenant });
      // 4) Delete tenant itself
      await Tenant.findByIdAndDelete(targetUser.tenant);
      // 5) Delete the companyAdmin
      await User.findByIdAndDelete(targetUser._id);
    } else {
      // Normal user delete
      await User.findByIdAndDelete(targetUser._id);
    }

    res.status(200).json({
      message: "User deleted successfully",
      deletedUserId: targetUser._id,
      deletedUserRole: targetUser.role,
      affectedUsers: affectedUsers.map(user => user._id), // Return IDs of deleted members
    });
  } catch (err) {
    console.error("Delete Error:", err);
    next(err);
  }
};

exports.toggleActive = async (req, res) => {
  try {
    const { id } = req.params;
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Tenant scoping
    if (req.user.role !== "admin" && targetUser.tenant && req.tenantId !== targetUser.tenant.toString()) {
      return res.status(403).json({ message: "Access denied: Wrong tenant" });
    }

    // Role-based checks
    if (req.user.role === "companyAdmin" && targetUser.role !== "member") {
      return res.status(403).json({ message: "CompanyAdmin can only toggle members" });
    }
    if (req.user.role === "member") {
      const currentUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });
      const hasTogglePermission = currentUser.customRoles.some(role =>
        role.permissions.some(perm => perm.name === "user:toggle")
      );
      if (!hasTogglePermission || targetUser.role !== "member") {
        return res.status(403).json({ message: "Not authorized to toggle this user" });
      }
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

    let affectedUsers = [];

    // ============ Cascade Logic ============
    // 1. ADMIN toggles COMPANY ADMIN → affect all tenant members
    if (req.user.role === "admin" && targetUser.role === "companyAdmin") {
      if (!targetUser.isActive) {
        // Deactivate all active members of tenant
        const result = await User.updateMany(
          { tenant: targetUser.tenant, role: "member", isActive: true },
          { $set: { isActive: false, deactivatedBy: "admin" } }
        );
        // Fetch affected users
        affectedUsers = await User.find({
          tenant: targetUser.tenant,
          role: "member",
          isActive: false,
          deactivatedBy: "admin",
        }).select("_id isActive");
      } else {
        // Reactivate only those members that were deactivated by ADMIN
        const result = await User.updateMany(
          { tenant: targetUser.tenant, role: "member", deleted: false, deactivatedBy: "admin" },
          { $set: { isActive: true, deactivatedBy: null } }
        );
        // Fetch affected users
        affectedUsers = await User.find({
          tenant: targetUser.tenant,
          role: "member",
          isActive: true,
          deleted: false,
        }).select("_id isActive");
      }
    }

    // 2. COMPANY ADMIN toggles a MEMBER
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
      updatedUser: { _id: targetUser._id, isActive: targetUser.isActive },
      affectedUsers: affectedUsers.map(user => ({ _id: user._id, isActive: user.isActive })), // Return IDs and isActive
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

    // 🏢 Tenant scoping and role restrictions
    if (req.user.role.toLowerCase() !== "admin") {
      if (req.tenantId) {
        query.tenant = req.tenantId;
        // Non-admins should not see admins
        query.role = { $ne: "admin" };
        // Members should not see companyAdmins
        if (req.user.role.toLowerCase() === "member") {
          query.role = { $nin: ["admin", "companyAdmin"] };
        }
        // console.log("🏢 Tenant scoping applied for non-admin:", req.tenantId, "Role:", req.user.role);
      } else {
        // console.log("🚫 Access denied: No tenant for non-admin user");
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

    // --- Role based export restrictions ---
    if (req.user.role === "member") {
      // Populate user with customRoles and permissions
      const populatedUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });

      // Check if any custom role has the 'user:export' permission
      const hasPermission = populatedUser?.customRoles?.some((role) =>
        role.permissions.some((p) => p.name === "user:export")
      );

      if (!hasPermission) {
        return res
          .status(403)
          .json({ message: "Access denied: Permission 'user:export' required" });
      }

      // Tenant validation (members can only export within their tenant)
      if (
        user.tenant &&
        user.tenant._id.toString() !== req.user.tenant._id.toString()
      ) {
        return res.status(403).json({
          message: "Access denied: Cannot export users from a different tenant",
        });
      }
    } else if (req.user.role === "companyAdmin") {
      // CompanyAdmin tenant validation
      if (
        user.tenant &&
        req.tenantId !== user.tenant._id.toString()
      ) {
        return res
          .status(403)
          .json({ message: "Access denied: Wrong tenant" });
      }
    } else if (req.user.role !== "admin") {
      // Only admin, companyAdmin, or member(with permission) can reach here
      return res
        .status(403)
        .json({ message: "Access denied: Insufficient permissions" });
    }
    // // Tenant scoping
    // if (req.user.role !== "admin" && req.user.role !== "companyAdmin") {
    //   console.error('exportUserDataPDF: Access denied', {
    //     requesterRole: req.user.role,
    //   });
    //   return res.status(403).json({ message: "Access denied: Insufficient permissions" });
    // }

    // if (req.user.role !== "admin" && user.tenant && req.tenantId !== user.tenant._id.toString()) {
    //   console.error('exportUserDataPDF: Access denied', {
    //     requesterTenant: req.tenantId,
    //     userTenant: user.tenant._id.toString(),
    //   });
    //   return res.status(403).json({ message: "Access denied: Wrong tenant" });
    // }

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
