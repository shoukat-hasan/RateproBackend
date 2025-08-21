// controllers/roleController.js
// const Role = require("../models/Role");
// const User = require("../models/User");

// exports.createRole = async (req, res, next) => {
//   try {
//     const { name, permissions = [], description, tenantId } = req.body;

//     // determine tenant: admin may specify tenantId, company uses req.user.tenant
//     let tenant = tenantId || req.user.tenant;
//     if (!tenant && req.user.role !== "admin") return res.status(400).json({ message: "tenantId required" });

//     const role = await Role.create({
//       name, permissions, description, tenant, createdBy: req.user._id
//     });

//     res.status(201).json({ message: "Role created", role });
//   } catch (err) { next(err); }
// };

// exports.getRoles = async (req, res, next) => {
//   try {
//     const tenantId = req.query.tenantId || req.user.tenant;
//     const query = tenantId ? { tenant: tenantId } : { tenant: null };
//     const roles = await Role.find(query);
//     res.json(roles);
//   } catch (err) { next(err); }
// };

// exports.assignRoleToUser = async (req, res, next) => {
//   try {
//     const { userId } = req.params;
//     const { roleId } = req.body;

//     const role = await Role.findById(roleId);
//     if (!role) return res.status(404).json({ message: "Role not found" });

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     // Ensure tenant match unless admin
//     if (req.user.role !== "admin" && String(role.tenant) !== String(req.user.tenant)) {
//       return res.status(403).json({ message: "Cannot assign role from different tenant" });
//     }

//     user.roles = user.roles || [];
//     if (!user.roles.some(r => String(r) === String(role._id))) user.roles.push(role._id);
//     await user.save();

//     res.json({ message: "Role assigned", user });
//   } catch (err) { next(err); }
// };

// exports.removeRoleFromUser = async (req, res, next) => {
//   try {
//     const { userId } = req.params;
//     const { roleId } = req.body;
//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ message: "User not found" });

//     user.roles = (user.roles || []).filter(r => String(r) !== String(roleId));
//     await user.save();
//     res.json({ message: "Role removed", user });
//   } catch (err) { next(err); }
// };

const CustomRole = require("../models/CustomRole");
const User = require("../models/User");
const Permission = require("../models/Permission");
const Joi = require("joi");

// Validation Schemas
const createRoleSchema = Joi.object({
  name: Joi.string().min(3).max(50).required().messages({
    "string.min": "Role name must be at least 3 characters",
    "string.max": "Role name cannot exceed 50 characters",
    "any.required": "Role name is required",
  }),
  permissions: Joi.array().items(Joi.string().hex().length(24)).optional(),
  description: Joi.string().optional(),
  tenantId: Joi.string().hex().length(24).optional(),
});

const getRolesSchema = Joi.object({
  tenantId: Joi.string().hex().length(24).optional(),
});

const assignRoleSchema = Joi.object({
  roleId: Joi.string().hex().length(24).required(),
});

const removeRoleSchema = Joi.object({
  roleId: Joi.string().hex().length(24).required(),
});

exports.createRole = async (req, res, next) => {
  try {
    const { error } = createRoleSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { name, permissions = [], description, tenantId } = req.body;

    // Restrict to admin or companyAdmin
    if (!["admin", "companyAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only admin or companyAdmin can create roles" });
    }

    // Tenant scoping
    let tenant = tenantId || req.tenantId;
    if (!tenant && req.user.role !== "admin") {
      return res.status(400).json({ message: "tenantId required for companyAdmin" });
    }
    if (req.user.role === "companyAdmin" && tenantId && tenantId !== req.tenantId) {
      return res.status(403).json({ message: "Cannot create role for another tenant" });
    }

    // Validate permissions
    if (permissions.length > 0) {
      const validPermissions = await Permission.find({ _id: { $in: permissions } });
      if (validPermissions.length !== permissions.length) {
        return res.status(400).json({ message: "Invalid permission IDs" });
      }
    }

    const roleExists = await CustomRole.findOne({ name, tenant });
    if (roleExists) return res.status(400).json({ message: "Role already exists in this tenant" });

    const role = await CustomRole.create({
      name,
      permissions,
      description,
      tenant: req.user.role === "admin" && !tenantId ? null : tenant,
      createdBy: req.user._id,
    });

    const populatedRole = await CustomRole.findById(role._id).populate("permissions tenant");

    res.status(201).json({ message: "Role created", role: populatedRole });
  } catch (err) {
    console.error("Error creating role:", err);
    next(err);
  }
};

exports.getRoles = async (req, res, next) => {
  try {
    const { error } = getRolesSchema.validate(req.query);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { tenantId } = req.query;

    // Restrict to admin or companyAdmin
    if (!["admin", "companyAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only admin or companyAdmin can view roles" });
    }

    // Tenant scoping
    let query = {};
    if (req.user.role === "companyAdmin") {
      query.tenant = req.tenantId;
    } else if (req.user.role === "admin" && tenantId) {
      query.tenant = tenantId;
    } else if (req.user.role === "admin") {
      query.tenant = null;
    }

    const roles = await CustomRole.find(query).populate("permissions tenant");

    res.status(200).json({ message: "Roles retrieved", roles });
  } catch (err) {
    console.error("Error getting roles:", err);
    next(err);
  }
};

exports.assignRoleToUser = async (req, res, next) => {
  try {
    const { error: bodyError } = assignRoleSchema.validate(req.body);
    const { error: paramError } = Joi.object({ userId: Joi.string().hex().length(24).required() }).validate(req.params);
    if (bodyError || paramError) return res.status(400).json({ message: (bodyError || paramError).details[0].message });

    const { userId } = req.params;
    const { roleId } = req.body;

    // Restrict to admin or companyAdmin
    if (!["admin", "companyAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only admin or companyAdmin can assign roles" });
    }

    const role = await CustomRole.findById(roleId).populate("tenant");
    if (!role) return res.status(404).json({ message: "Role not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure role assignment only to members
    if (user.role !== "member") {
      return res.status(400).json({ message: "Can only assign roles to members" });
    }

    // Tenant scoping
    if (req.user.role !== "admin" && role.tenant && role.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot assign role from different tenant" });
    }
    if (req.user.role !== "admin" && user.tenant && user.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot assign role to user from different tenant" });
    }

    user.customRoles = user.customRoles || [];
    if (!user.customRoles.some(r => r.toString() === roleId)) {
      user.customRoles.push(roleId);
      await user.save();
    }

    const updatedUser = await User.findById(userId).select("-password").populate("tenant customRoles");

    res.status(200).json({ message: "Role assigned", user: updatedUser });
  } catch (err) {
    console.error("Error assigning role:", err);
    next(err);
  }
};

exports.removeRoleFromUser = async (req, res, next) => {
  try {
    const { error: bodyError } = removeRoleSchema.validate(req.body);
    const { error: paramError } = Joi.object({ userId: Joi.string().hex().length(24).required() }).validate(req.params);
    if (bodyError || paramError) return res.status(400).json({ message: (bodyError || paramError).details[0].message });

    const { userId } = req.params;
    const { roleId } = req.body;

    // Restrict to admin or companyAdmin
    if (!["admin", "companyAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only admin or companyAdmin can remove roles" });
    }

    const role = await CustomRole.findById(roleId).populate("tenant");
    if (!role) return res.status(404).json({ message: "Role not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Tenant scoping
    if (req.user.role !== "admin" && role.tenant && role.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot remove role from different tenant" });
    }
    if (req.user.role !== "admin" && user.tenant && user.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot remove role from user in different tenant" });
    }

    user.customRoles = (user.customRoles || []).filter(r => r.toString() !== roleId);
    await user.save();

    const updatedUser = await User.findById(userId).select("-password").populate("tenant customRoles");

    res.status(200).json({ message: "Role removed", user: updatedUser });
  } catch (err) {
    console.error("Error removing role:", err);
    next(err);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const { error: bodyError } = createRoleSchema.validate(req.body);
    const { error: paramError } = Joi.object({ roleId: Joi.string().hex().length(24).required() }).validate(req.params);
    if (bodyError || paramError) return res.status(400).json({ message: (bodyError || paramError).details[0].message });

    const { roleId } = req.params;
    const { name, permissions, description } = req.body;

    // Restrict to admin or companyAdmin
    if (!["admin", "companyAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only admin or companyAdmin can update roles" });
    }

    const role = await CustomRole.findById(roleId).populate("tenant");
    if (!role) return res.status(404).json({ message: "Role not found" });

    // Tenant scoping
    if (req.user.role !== "admin" && role.tenant && role.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot update role from different tenant" });
    }

    // Validate permissions
    if (permissions && permissions.length > 0) {
      const validPermissions = await Permission.find({ _id: { $in: permissions } });
      if (validPermissions.length !== permissions.length) {
        return res.status(400).json({ message: "Invalid permission IDs" });
      }
    }

    role.name = name || role.name;
    role.permissions = permissions || role.permissions;
    role.description = description || role.description;

    await role.save();

    const updatedRole = await CustomRole.findById(roleId).populate("permissions tenant");

    res.status(200).json({ message: "Role updated", role: updatedRole });
  } catch (err) {
    console.error("Error updating role:", err);
    next(err);
  }
};

exports.deleteRole = async (req, res, next) => {
  try {
    const { error } = Joi.object({ roleId: Joi.string().hex().length(24).required() }).validate(req.params);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { roleId } = req.params;

    // Restrict to admin or companyAdmin
    if (!["admin", "companyAdmin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Only admin or companyAdmin can delete roles" });
    }

    const role = await CustomRole.findById(roleId).populate("tenant");
    if (!role) return res.status(404).json({ message: "Role not found" });

    // Tenant scoping
    if (req.user.role !== "admin" && role.tenant && role.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot delete role from different tenant" });
    }

    // Remove role from all users
    await User.updateMany(
      { customRoles: roleId },
      { $pull: { customRoles: roleId } }
    );

    await CustomRole.findByIdAndDelete(roleId);

    res.status(200).json({ message: "Role deleted" });
  } catch (err) {
    console.error("Error deleting role:", err);
    next(err);
  }
};