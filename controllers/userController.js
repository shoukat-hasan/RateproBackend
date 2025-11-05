// /controllers/userController.js
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const OTP = require("../models/OTP");
const UserCategory = require('../models/UserCategory');
const Department = require("../models/Department")
const Permission = require("../models/Permission");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../utils/cloudinary");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const moment = require("moment");
const Joi = require("joi");
const getBaseURL = require("../utils/getBaseURL");
const XLSX = require('xlsx');

// Multer setup for Excel
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Helper: Generate OTP Code
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Validation Schemas
const bulkUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  isActive: Joi.boolean().optional(),
  role: Joi.string().valid('member').required(),
  department: Joi.string().required(), // Department name (not ID)
});

const createUserSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  isActive: Joi.boolean().optional(),
  role: Joi.string().valid("admin", "companyAdmin", "member").required(),
  tenantName: Joi.string().min(2).max(100).optional(),
  department: Joi.string().optional(),
  tenant: Joi.string().optional(),
  userCategories: Joi.array().items(Joi.string().hex().length(24)).optional(),
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
  userCategories: Joi.array().items(Joi.string().hex().length(24)).optional(),
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

exports.bulkCreateUsers = async (req, res) => {
  try {
    const currentUser = req.user;
    if (currentUser.role !== 'companyAdmin') {
      return res.status(403).json({ message: 'Access denied: Only CompanyAdmin can perform bulk upload' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

    if (rows.length < 2) {
      return res.status(400).json({ message: 'Empty or invalid Excel file. Must have at least one data row.' });
    }

    const dataRows = rows.slice(1);
    const tenantId = currentUser.tenant._id ? currentUser.tenant._id.toString() : currentUser.tenant;

    const tenantData = await Tenant.findById(tenantId).populate('departments');
    if (!tenantId || !tenantData) {
      return res.status(403).json({ message: 'Access denied: No valid tenant associated' });
    }

    // ================================
    // 1. DEPARTMENT MAPPING
    // ================================
    const deptNamesSet = new Set();
    dataRows.forEach(row => {
      if (row[5]) deptNamesSet.add(row[5].toString().trim());
    });

    const uniqueDeptNames = Array.from(deptNamesSet);
    const deptMap = new Map();

    if (uniqueDeptNames.length > 0) {
      const existingDepts = await Department.find({ tenant: tenantId, name: { $in: uniqueDeptNames } });
      existingDepts.forEach(dept => deptMap.set(dept.name, dept._id.toString()));

      const missingDepts = uniqueDeptNames.filter(name => !deptMap.has(name));
      if (missingDepts.length > 0) {
        const newDepts = missingDepts.map(name => ({ tenant: tenantId, name, head: '' }));
        const createdDepts = await Department.insertMany(newDepts);
        createdDepts.forEach(dept => deptMap.set(dept.name, dept._id.toString()));
        await Tenant.findByIdAndUpdate(tenantId, { $push: { departments: { $each: createdDepts.map(d => d._id) } } });
      }
    }

    // ================================
    // 2. USER CATEGORY MAPPING (FIXED)
    // ================================
    const categoryNameMap = new Map();
    let existingCats = []; // ← DECLARED OUTSIDE

    const allCategoryNames = new Set();
    dataRows.forEach(row => {
      if (row[6]) {
        const cats = row[6].toString().trim().split(',').map(c => c.trim());
        cats.forEach(c => allCategoryNames.add(c));
      }
    });

    if (allCategoryNames.size > 0) {
      existingCats = await UserCategory.find({
        name: { $in: Array.from(allCategoryNames) },
        active: true,
        $or: [
          { tenant: tenantId },
          { tenant: null },
        ],
      });

      existingCats.forEach(cat => categoryNameMap.set(cat.name, cat._id.toString()));
    }

    // ================================
    // 3. PROCESS EACH ROW
    // ================================
    const successes = [];
    const errors = [];

    for (const row of dataRows) {
      // Minimum 6 columns: name, email, password, role, status, department
      if (row.length < 6) {
        errors.push({ row: row.join(','), message: 'Invalid row: less than 6 columns' });
        continue;
      }

      const [
        name,
        email,
        password,
        role,
        statusStr,
        departmentName,
        categoriesStr
      ] = row.map(val => val?.toString().trim() || '');

      // Parse categories
      let userCategoryIds = [];
      let userType = 'internal';

      if (categoriesStr) {
        const catNames = categoriesStr.split(',').map(c => c.trim()).filter(c => c);
        if (catNames.length > 0) {
          userCategoryIds = catNames
            .map(name => categoryNameMap.get(name))
            .filter(id => id);

          if (catNames.length !== userCategoryIds.length) {
            errors.push({ email, message: `Category not found: ${catNames.find(n => !categoryNameMap.has(n))}` });
            continue;
          }

          // Determine userType
          const hasExternal = userCategoryIds.some(id => {
            const cat = existingCats.find(c => c._id.toString() === id);
            return cat?.type === 'external';
          });
          userType = hasExternal ? 'external' : 'internal';
        }
      }

      const isActive = statusStr.toLowerCase() === 'active';

      // Validate schema
      const { error: validationError } = bulkUserSchema.validate({
        name,
        email,
        password,
        isActive,
        role,
        department: departmentName
      });

      if (validationError) {
        errors.push({ email, message: validationError.details[0].message });
        continue;
      }

      if (role !== 'member') {
        errors.push({ email, message: 'Invalid role, must be "member"' });
        continue;
      }

      if (!departmentName) {
        errors.push({ email, message: 'Department name is required' });
        continue;
      }

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        errors.push({ email, message: 'User already exists with this email' });
        continue;
      }

      const deptId = deptMap.get(departmentName);
      if (!deptId) {
        errors.push({ email, message: 'Department not found or could not be created' });
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await User.create({
        name,
        email,
        password: hashedPassword,
        role: 'member',
        authProvider: 'local',
        tenant: tenantId,
        department: deptId,
        isVerified: false,
        isActive,
        createdBy: currentUser._id,
        deleted: false,
        phone: '',
        bio: '',
        avatar: { public_id: '', url: '' },
        userCategories: userCategoryIds,
        userType,
        customRoles: [],
        surveyStats: null,
      });

      // Send verification email
      const verificationCode = generateOTP();
      const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES || 15, 'minutes').toDate();
      await OTP.create({ email, code: verificationCode, purpose: 'verify', expiresAt });

      const baseURLs = getBaseURL();
      const baseURL = baseURLs.public;
      const verificationLink = `${baseURL}/verify-email?code=${verificationCode}&email=${encodeURIComponent(email)}`;

      await sendEmail({
        to: email,
        subject: 'Verify your email - RatePro',
        html: `
          <p>Hello ${name},</p>
          <p>Your account has been successfully created.</p>
          <p><strong>Login Email:</strong> ${email}</p>
          <p><strong>Temporary Password:</strong> ${password}</p>
          <p>Please verify your email by clicking the link below:</p>
          <p><a href="${verificationLink}" target="_blank">${verificationLink}</a></p>
          <p>This code will expire in ${process.env.OTP_EXPIRE_MINUTES || 15} minute(s).</p>
          <br/>
          <p>Regards,<br/>Team RatePro</p>
        `,
      });

      successes.push({ id: newUser._id, email: newUser.email });
    }

    // ================================
    // 4. FINAL RESPONSE
    // ================================
    res.status(201).json({
      message: 'Bulk user creation completed',
      totalProcessed: dataRows.length,
      successful: successes.length,
      failed: errors.length,
      createdUsers: successes,
      errors: errors.length > 0 ? errors : null,
    });

  } catch (err) {
    console.error('BulkCreateUsers error:', err);
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Duplicate email found in database' });
    }
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    console.log("➡️ Incoming userCategories:", req.body.userCategories);
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
        // console.log('Tenant mismatch');
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

    // --- USER CATEGORIES VALIDATION ---
    let userCategories = [];
    let validCategories = [];
    if (req.body.userCategories && req.body.userCategories.length > 0) {
      const categoryIds = req.body.userCategories;

      // const validCategories = await UserCategory.find({
      //   _id: { $in: categoryIds },
      //   tenant: tenantId,
      //   active: true,
      // });
      validCategories = await UserCategory.find({
        _id: { $in: categoryIds },
        active: true,
        $or: [
          { tenant: tenantId },
          { tenant: null },
        ],
      });

      if (validCategories.length !== categoryIds.length) {
        return res.status(400).json({ message: 'Invalid or unauthorized user categories' });
      }

      userCategories = validCategories.map(c => c._id);

      // Auto-set userType based on categories
      const hasExternal = validCategories.some(c => c.type === 'external');
      if (hasExternal && role === 'member') {
        // member can be external
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
        userCategories,
        userType: userCategories.some(id => validCategories.find(c => c._id.toString() === id.toString())?.type === 'external')
          ? 'external'
          : 'internal',
      });
    }

    // OTP
    const verificationCode = generateOTP();
    const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES || 15, 'minutes').toDate();
    await OTP.create({ email, code: verificationCode, purpose: 'verify', expiresAt });
    // console.log('OTP generated:', verificationCode);

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
    console.log("➡️ Incoming userCategories:", req.body.userCategories);
    const { id } = req.params;
    let updates = { ...req.body };

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ Determine tenantId safely
    let tenantId = user.tenant?._id?.toString() || user.tenant;

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

    let validCategories = [];

    // --- USER CATEGORIES UPDATE ---
    if (updates.userCategories) {
      const categoryIds = updates.userCategories;

      validCategories = await UserCategory.find({
        _id: { $in: categoryIds },
        active: true,
        $or: [
          { tenant: tenantId },
          { tenant: null },
        ],
      });

      if (validCategories.length !== categoryIds.length) {
        return res.status(400).json({ message: 'Invalid user categories' });
      }

      updates.userCategories = validCategories.map(c => c._id);

      // ✅ Update userType based on category type
      const hasExternal = validCategories.some(c => c.type === 'external');
      updates.userType = hasExternal ? 'external' : 'internal';

      // ✅ NEW: Clear department if user became external
      if (hasExternal) {
        updates.department = null; // or undefined (depends on your schema)
      }
    }

    // ----- ROLE BASED FIELD CONTROL -----
    if (req.user.role === "admin") {
      const allowedFields = ["name", "role", "isActive", "companyName", "userCategories", "userType"];
      Object.keys(updates).forEach((key) => {
        if (!allowedFields.includes(key)) delete updates[key];
      });
    } else if (req.user.role === "companyAdmin") {
      const allowedFields = ["name", "isActive", "department", "userCategories", "userType"];
      Object.keys(updates).forEach((key) => {
        if (!allowedFields.includes(key)) delete updates[key];
      });
    } else if (req.user.role === "member") {
      const allowedFields = ["name", "isActive", "userCategories", "userType"];
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
      .populate("tenant customRoles department userCategories")
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

    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="user-${user._id}.pdf"`
    );

    doc.pipe(res);

    // ===== Header (logo + title) =====
    const logoUrl = "https://ratepro-sa.com/assets/img/RATEPRO_-BupZjzpX.png";
    const response = await axios.get(logoUrl, { responseType: "arraybuffer" });
    const logoBuffer = Buffer.from(response.data, "binary");

    doc.rect(0, 0, doc.page.width, 80).fill("#b6ebe0");
    doc.image(logoBuffer, 30, 20, { width: 50 });
    doc.fillColor("#13c5d0")
      .fontSize(26)
      .text("User Data Report", 0, 40, { align: "center" });

    doc.moveDown(2);

    // ===== Utility: Section Box =====
    const sectionBox = (title, draw) => {
      doc.moveDown(1);
      const startY = doc.y;
      const paddingY = 15;

      // Background rectangle
      doc.rect(40, startY - 10, doc.page.width - 80, 150).fill("#b6ebe0").stroke();

      doc.fillColor("#13c5d0").fontSize(16).text(title, 50, startY, { underline: true });

      doc.moveDown(0.5);

      doc.fillColor("black").fontSize(12);
      draw(startY + 20 + paddingY);

    };

    // ===== User Info Section =====
    sectionBox("User Information", (y) => {
      doc.text(`Name: ${user.name}`, 60, y);
      doc.text(`Email: ${user.email}`);
      doc.text(`Role: ${user.role}`);
      doc.text(`Active: ${user.isActive}`);
      doc.text(`Verified: ${user.isVerified}`);
      doc.text(`Department: ${user.department?.name || "N/A"}`);
    });

    // ===== Tenant Info =====
    if (user.tenant) {
      sectionBox("Company Information", (y) => {
        doc.text(`Company Name: ${user.tenant.name || "N/A"}`, 60, y);
        doc.text(`Company Email: ${user.tenant.email || "N/A"}`);
        doc.text(
          `Departments: ${user.tenant.departments?.length > 0
            ? user.tenant.departments.map((d) => d.name || "N/A").join(", ")
            : "None"
          }`
        );
      });
    }

    // ===== Survey Stats =====
    const stats = user.surveyStats || {};
    sectionBox("Survey Statistics", (y) => {
      doc.text(`Total Surveys Taken: ${stats.totalSurveysTaken || 0}`, 60, y);
      doc.text(`Total Responses: ${stats.totalResponses || 0}`);
      doc.text(`Average Score: ${stats.averageScore || 0}`);
    });

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
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // ----------------- JWT VERIFY -----------------
    const token = req.cookies?.accessToken;

    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const userId = decoded._id || decoded.id;

    // ----------------- FETCH USER -----------------
    const user = await User.findById(userId).populate("tenant");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ----------------- UPDATE USER FIELDS -----------------
    const fieldsToUpdate = ["name", "email", "phone", "bio", "department"];
    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        user[field] = req.body[field];
      }
    });

    // ----------------- TENANT/COMPANY UPDATE -----------------
    if (req.body.tenant && user.role === "companyAdmin") {
      let tenant = await Tenant.findById(user.tenant?._id);
      if (!tenant) {
        return res.status(404).json({ message: "Tenant not found" });
      }

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

      user.avatar = {
        public_id: uploadResult.public_id,
        url: uploadResult.secure_url
      };
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
    console.error("❌ [updateMe] error:", err);
    next(err);
  }
};

// exports.bulkCreateUsers = async (req, res) => {
//   try {

//     const currentUser = req.user;
//     if (currentUser.role !== 'companyAdmin') {
//       return res.status(403).json({ message: 'Access denied: Only CompanyAdmin can perform bulk upload' });
//     }

//     if (!req.file) {
//       return res.status(400).json({ message: 'No Excel file uploaded' });
//     }

//     const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
//     const sheetName = workbook.SheetNames[0];
//     const worksheet = workbook.Sheets[sheetName];
//     const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

//     if (rows.length < 2) {
//       return res.status(400).json({ message: 'Empty or invalid Excel file' });
//     }

//     const dataRows = rows.slice(1);
//     const tenantId = currentUser.tenant._id ? currentUser.tenant._id.toString() : currentUser.tenant;

//     const tenantData = await Tenant.findById(tenantId).populate('departments');
//     if (!tenantId || !tenantData) {
//       return res.status(403).json({ message: 'Access denied: No valid tenant associated' });
//     }

//     // Collect unique departments
//     const deptNamesSet = new Set();
//     dataRows.forEach(row => {
//       if (row[5]) deptNamesSet.add(row[5].toString().trim());
//     });

//     const uniqueDeptNames = Array.from(deptNamesSet);

//     const existingDepts = await Department.find({ tenant: tenantId, name: { $in: uniqueDeptNames } });

//     const deptMap = new Map(existingDepts.map(dept => [dept.name, dept._id.toString()]));

//     const missingDepts = uniqueDeptNames.filter(name => !deptMap.has(name));
//     if (missingDepts.length > 0) {
//       const newDepts = missingDepts.map(name => ({ tenant: tenantId, name, head: '' }));
//       const createdDepts = await Department.insertMany(newDepts);
//       createdDepts.forEach(dept => deptMap.set(dept.name, dept._id.toString()));
//       await Tenant.findByIdAndUpdate(tenantId, { $push: { departments: { $each: createdDepts.map(d => d._id) } } });
//     }

//     // --- CATEGORY MAPPING (New) ---
//     const categoryNameMap = new Map(); // "Vendor" → ObjectId

//     // Collect all category names from rows
//     const allCategoryNames = new Set();
//     dataRows.forEach(row => {
//       if (row[6]) {
//         const cats = row[6].toString().trim().split(',').map(c => c.trim());
//         cats.forEach(c => allCategoryNames.add(c));
//       }
//     });

//     if (allCategoryNames.size > 0) {
//       const existingCats = await UserCategory.find({
//         tenant: tenantId,
//         name: { $in: Array.from(allCategoryNames) },
//         active: true,
//       });

//       existingCats.forEach(cat => categoryNameMap.set(cat.name, cat._id.toString()));
//     }

//     // Process rows
//     const successes = [];
//     const errors = [];

//     for (const row of dataRows) {

//       if (row.length < 6) {
//         errors.push({ row: row.join(','), message: 'Invalid row length' });
//         continue;
//       }

//       const [name, email, password, role, statusStr, departmentName, categoriesStr] = row.map(val => val.toString().trim());
//       // Parse categories
//       let userCategoryIds = [];
//       if (categoriesStr) {
//         const catNames = categoriesStr.split(',').map(c => c.trim());
//         userCategoryIds = catNames
//           .map(name => categoryNameMap.get(name))
//           .filter(id => id); // only valid ones

//         if (catNames.length !== userCategoryIds.length) {
//           errors.push({ email, message: 'One or more categories not found' });
//           continue;
//         }
//       }

//       // Determine userType
//       const hasExternalCat = userCategoryIds.some(id => {
//         const cat = existingCats.find(c => c._id.toString() === id);
//         return cat?.type === 'external';
//       });
//       const userType = hasExternalCat ? 'external' : 'internal';
//       const isActive = statusStr.toLowerCase() === 'active';

//       // Validation
//       const { error: validationError } = bulkUserSchema.validate({ name, email, password, isActive, role, department: departmentName });
//       if (validationError) {
//         errors.push({ email, message: validationError.details[0].message });
//         continue;
//       }

//       if (role !== 'member') {
//         errors.push({ email, message: 'Invalid role, must be member' });
//         continue;
//       }

//       const existingUser = await User.findOne({ email });
//       if (existingUser) {
//         errors.push({ email, message: 'User already exists with this email' });
//         continue;
//       }

//       const deptId = deptMap.get(departmentName);
//       if (!deptId) {
//         errors.push({ email, message: 'Department not found or created' });
//         continue;
//       }

//       const hashedPassword = await bcrypt.hash(password, 10);

//       const newUser = await User.create({
//         name,
//         email,
//         password: hashedPassword,
//         role: 'member',
//         authProvider: 'local',
//         tenant: tenantId,
//         department: deptId,
//         isVerified: false,
//         isActive,
//         createdBy: currentUser._id,
//         deleted: false,
//         phone: '',
//         bio: '',
//         avatar: { public_id: '', url: '' },
//         userCategories: userCategoryIds,
//         userType,
//         customRoles: [],
//         surveyStats: null,
//       });

//       const verificationCode = generateOTP();
//       const expiresAt = moment().add(process.env.OTP_EXPIRE_MINUTES || 15, 'minutes').toDate();
//       await OTP.create({ email, code: verificationCode, purpose: 'verify', expiresAt });

//       const baseURLs = getBaseURL();
//       const baseURL = baseURLs.public;
//       const verificationLink = `${baseURL}/verify-email?code=${verificationCode}&email=${encodeURIComponent(email)}`;

//       // console.log("📧 Sending email to:", email);
//       await sendEmail({
//         to: email,
//         subject: 'Verify your email - RatePro',
//         html: `
//           <p>Hello ${name},</p>
//           <p>Your account has been successfully created.</p>
//           <p><strong>Login Email:</strong> ${email}</p>
//           <p><strong>Temporary Password:</strong> ${password}</p>
//           <p>Please verify your email by clicking the link below:</p>
//           <p><a href="${verificationLink}" target="_blank">${verificationLink}</a></p>
//           <p>This code will expire in ${process.env.OTP_EXPIRE_MINUTES} minute(s).</p>
//           <br/>
//           <p>Regards,<br/>Team</p>
//         `,
//       });

//       successes.push({ id: newUser._id, email: newUser.email });
//     }

//     res.status(201).json({
//       message: 'Bulk user creation processed',
//       successful: successes.length,
//       errors: errors.length > 0 ? errors : null,
//       createdUsers: successes,
//     });
//   } catch (err) {
//     console.error('💥 BulkCreateUsers error:', err);
//     if (err.code === 11000) {
//       return res.status(400).json({ message: 'Duplicate key error (e.g., email)' });
//     }
//     res.status(500).json({ message: 'Internal Server Error' });
//   }
// };
