// controllers/roleController.js
const mongoose = require('mongoose');
const CustomRole = require("../models/CustomRole");
const User = require("../models/User");
const Permission = require("../models/Permission");
const Joi = require("joi");
const crypto = require("crypto");
const Logger = require("../utils/auditLog");

// Validation Schemas
const createRoleSchema = Joi.object({
  name: Joi.string().min(3).max(50).required().messages({
    "string.min": "Role name must be at least 3 characters",
    "string.max": "Role name cannot exceed 50 characters",
    "any.required": "Role name is required",
  }),
  permissions: Joi.array().items(Joi.string().hex().length(24)).optional(),
  description: Joi.string().allow("").optional(),
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

const getUsersByRoleSchema = Joi.object({
  roleId: Joi.string().hex().length(24).required(),
});

// Create a new role
exports.createRole = async (req, res) => {
  try {
    const { name, permissions, description, tenantId } = req.body;

    if (!name || !permissions || !tenantId) {
      return res.status(400).json({ message: "Name, permissions, and tenantId are required" });
    }

    if (!req.user.tenant || !req.user.tenant._id) {
      return res.status(403).json({ message: "User has no associated tenant" });
    }

    if (req.user.tenant._id.toString() !== tenantId) {
      return res.status(403).json({
        message: `Cannot create role for another tenant. User tenant: ${req.user.tenant._id}, Payload tenant: ${tenantId}`,
      });
    }

    // --- Role-based restrictions ---
    if (req.user.role === "companyAdmin") {
      // ✅ companyAdmin allowed
    } else if (req.user.role === "member") {
      const populatedUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });

      if (!populatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === "role:create")
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied: Permission 'role:create' required" });
      }
    } else {
      return res.status(403).json({ message: "Only CompanyAdmin or Member (with permission) can create roles" });
    }

    // --- Validate permissions ---
    const validPermissions = await Permission.find({ _id: { $in: permissions } });
    if (validPermissions.length !== permissions.length) {
      return res.status(400).json({ message: "Invalid permissions provided" });
    }

    // --- Generate unique signature for (name + permissions) combo ---
    const sorted = validPermissions.map((p) => p._id.toString()).sort().join("_");
    const permissionsSignature = crypto.createHash("md5").update(sorted).digest("hex");

    const existingRole = await CustomRole.findOne({
      name,
      tenant: tenantId,
      permissionsSignature,
    });

    if (existingRole) {
      return res.status(400).json({ message: "Role with same name and permissions already exists" });
    }

    // --- Create role ---
    const permissionsWithNames = validPermissions.map((perm) => ({
      _id: perm._id,
      name: perm.name,
    }));

    const role = await CustomRole.create({
      name,
      permissions: permissionsWithNames,
      description,
      tenant: tenantId,
      createdBy: req.user._id,
      permissionsSignature,
    });

    await role.populate("permissions", "name");

    await Logger.info("createRole", "Role created successfully", {
      triggeredBy: req.user?.email,
      tenantId,
      roleId: role._id,
      roleName: role.name,
      totalPermissions: permissions.length,
      statusCode: 201,
    });

    return res.status(201).json({ role });
  } catch (error) {
    console.error("💥 Error creating role:", error);

    await Logger.error("createRole", "Unhandled error in role creation", {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({ message: "Failed to create role", error: error.message });
  }
};

// Get all roles
exports.getRoles = async (req, res, next) => {
  try {
    const { error } = getRolesSchema.validate(req.query);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { tenantId } = req.query;
    let query = {};

    if (req.user.role === "companyAdmin") {
      // ✅ companyAdmin is always allowed
      query.tenant = new mongoose.Types.ObjectId(req.tenantId);
    } else if (req.user.role === "member") {
      // check if member has 'role:read' permission
      const populatedUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });

      if (!populatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === "role:read")
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied: Permission 'role:read' required" });
      }

      query.tenant = new mongoose.Types.ObjectId(req.user.tenant._id);
    }

    const roles = await CustomRole.find(query).populate("permissions tenant");
    const total = await CustomRole.countDocuments(query);

    await Logger.info("getRoles", "Roles retrieved successfully", {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      total,
      statusCode: 200,
    });

    return res.status(200).json({ message: "Roles retrieved", roles, total });
  } catch (err) {
    console.error("💥 Error getting roles:", err);

    await Logger.error("getRoles", "Unhandled error in getRoles controller", {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      message: err.message,
      stack: err.stack,
    });

    return res.status(500).json({ message: "Failed to fetch roles", error: err.message });
  }
};

// Assign role to user
exports.assignRoleToUser = async (req, res, next) => {
  try {
    const { error: bodyError } = assignRoleSchema.validate(req.body);
    const { error: paramError } = Joi.object({
      userId: Joi.string().hex().length(24).required(),
    }).validate(req.params);

    if (bodyError || paramError) {
      return res.status(400).json({ message: (bodyError || paramError).details[0].message });
    }

    const { userId } = req.params;
    const { roleId } = req.body;

    // --- Role-based restrictions ---
    if (req.user.role === "companyAdmin") {
      // ✅ allowed directly
    } else if (req.user.role === "member") {
      const populatedUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });

      if (!populatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === "role:assign")
      );

      if (!hasPermission) {
        return res.status(403).json({ message: "Access denied: Permission 'role:assign' required" });
      }
    } else {
      return res.status(403).json({ message: "Only companyAdmin or member (with permission) can assign roles" });
    }

    const role = await CustomRole.findById(roleId).populate("tenant");
    if (!role) {
      return res.status(404).json({ message: "Role not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role !== "member") {
      return res.status(400).json({ message: "Can only assign roles to members" });
    }

    if (req.user.role !== "admin" && role.tenant && role.tenant._id.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot assign role from different tenant" });
    }

    if (req.user.role !== "admin" && user.tenant && user.tenant.toString() !== req.tenantId) {
      return res.status(403).json({ message: "Cannot assign role to user from different tenant" });
    }

    // ✅ assign role
    user.customRoles = user.customRoles || [];
    if (!user.customRoles.some((r) => r.toString() === roleId)) {
      user.customRoles.push(roleId);
      await user.save();
    }

    if (!role.users.includes(userId)) {
      role.users.push(userId);
      role.userCount = role.users.length;
      await role.save();
    }

    const updatedUser = await User.findById(userId)
      .select("-password")
      .populate("tenant customRoles");

    await Logger.info("assignRoleToUser", "Role assigned successfully", {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      assignedRole: role.name,
      targetUser: updatedUser.email,
      statusCode: 200,
    });

    return res.status(200).json({ message: "Role assigned", user: updatedUser });
  } catch (err) {
    console.error("💥 Error assigning role:", err);
    await Logger.error("assignRoleToUser", "Unexpected error while assigning role", {
      triggeredBy: req.user?.email,
      tenantId: req.tenantId,
      message: err.message,
      stack: err.stack,
    });
    return res.status(500).json({ message: "Failed to assign role", error: err.message });
  }
};

// Remove role from user
exports.removeRoleFromUser = async (req, res, next) => {
  try {
    const { error: bodyError } = removeRoleSchema.validate(req.body);
    const { error: paramError } = Joi.object({
      userId: Joi.string().hex().length(24).required(),
    }).validate(req.params);

    if (bodyError || paramError) {
      await logger.warn('removeRoleFromUser: Validation failed', {
        bodyError,
        paramError,
      });
      return res
        .status(400)
        .json({ message: (bodyError || paramError).details[0].message });
    }

    const { userId } = req.params;
    const { roleId } = req.body;

    await logger.info('removeRoleFromUser: Starting role removal', {
      userId,
      roleId,
      performedBy: req.user._id,
      tenantId: req.tenantId,
    });

    // --- Role-based restrictions ---
    if (req.user.role === 'companyAdmin') {
      await logger.info('removeRoleFromUser: Request by companyAdmin', {
        adminId: req.user._id,
      });
    } else if (req.user.role === 'member') {
      const populatedUser = await User.findById(req.user._id).populate({
        path: 'customRoles',
        populate: { path: 'permissions' },
      });

      if (!populatedUser) {
        await logger.error('removeRoleFromUser: Requesting user not found', {
          userId: req.user._id,
        });
        return res.status(404).json({ message: 'User not found' });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === 'role:remove')
      );

      if (!hasPermission) {
        await logger.warn('removeRoleFromUser: Missing permission role:remove', {
          userId: req.user._id,
        });
        return res.status(403).json({
          message: "Access denied: Permission 'role:remove' required",
        });
      }
    } else {
      await logger.warn('removeRoleFromUser: Invalid user role', {
        userRole: req.user.role,
      });
      return res.status(403).json({
        message: 'Only companyAdmin or member (with permission) can remove roles',
      });
    }

    const role = await CustomRole.findById(roleId).populate('tenant');
    if (!role) {
      await logger.warn('removeRoleFromUser: Role not found', { roleId });
      return res.status(404).json({ message: 'Role not found' });
    }

    const user = await User.findById(userId);
    if (!user) {
      await logger.warn('removeRoleFromUser: User not found', { userId });
      return res.status(404).json({ message: 'User not found' });
    }

    // Tenant validation
    if (
      req.user.role !== 'admin' &&
      role.tenant &&
      role.tenant._id.toString() !== req.tenantId
    ) {
      await logger.warn(
        'removeRoleFromUser: Attempt to remove role from another tenant',
        { tenantId: req.tenantId, roleTenant: role.tenant._id }
      );
      return res
        .status(403)
        .json({ message: 'Cannot remove role from different tenant' });
    }

    if (
      req.user.role !== 'admin' &&
      user.tenant &&
      user.tenant.toString() !== req.tenantId
    ) {
      await logger.warn(
        'removeRoleFromUser: Attempt to remove role from user of another tenant',
        { tenantId: req.tenantId, userTenant: user.tenant }
      );
      return res
        .status(403)
        .json({ message: 'Cannot remove role from user of different tenant' });
    }

    // Actual removal logic
    user.customRoles = (user.customRoles || []).filter(
      (r) => !(r._id ? r._id.equals(roleId) : r.equals(roleId))
    );
    await user.save();

    role.users = (role.users || []).filter((u) => u.toString() !== userId);
    role.userCount = role.users.length;
    await role.save();

    await logger.info('removeRoleFromUser: Role successfully removed', {
      userId,
      roleId,
      tenantId: req.tenantId,
    });

    const updatedUser = await User.findById(userId)
      .select('-password')
      .populate('tenant customRoles');

    return res.status(200).json({ message: 'Role removed', user: updatedUser });
  } catch (err) {
    await logger.error('removeRoleFromUser: Error', {
      error: err.message,
      stack: err.stack,
    });
    next(err);
  }
};

// Update an existing role
exports.updateRole = async (req, res, next) => {
  try {
    const { error: bodyError } = createRoleSchema.validate(req.body);
    const { error: paramError } = Joi.object({
      roleId: Joi.string().hex().length(24).required(),
    }).validate(req.params);

    if (bodyError || paramError) {
      await logger.warn('updateRole: Validation failed', {
        bodyError,
        paramError,
      });
      return res
        .status(400)
        .json({ message: (bodyError || paramError).details[0].message });
    }

    const { roleId } = req.params;
    const { name, permissions, description, tenantId } = req.body;

    await logger.info('updateRole: Starting role update', {
      roleId,
      performedBy: req.user._id,
      tenantId: req.tenantId,
    });

    // --- Role-based restrictions ---
    if (req.user.role === 'companyAdmin') {
      await logger.info('updateRole: Request by companyAdmin', {
        adminId: req.user._id,
      });
    } else if (req.user.role === 'member') {
      const populatedUser = await User.findById(req.user._id).populate({
        path: 'customRoles',
        populate: { path: 'permissions' },
      });

      if (!populatedUser) {
        await logger.error('updateRole: Requesting user not found', {
          userId: req.user._id,
        });
        return res.status(404).json({ message: 'User not found' });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === 'role:update')
      );

      if (!hasPermission) {
        await logger.warn('updateRole: Missing permission role:update', {
          userId: req.user._id,
        });
        return res
          .status(403)
          .json({ message: "Access denied: Permission 'role:update' required" });
      }
    } else {
      await logger.warn('updateRole: Invalid user role', {
        userRole: req.user.role,
      });
      return res.status(403).json({
        message:
          'Only companyAdmin or member (with permission) can update roles',
      });
    }

    // Fetch role
    const role = await CustomRole.findById(roleId).populate('tenant');
    if (!role) {
      await logger.warn('updateRole: Role not found', { roleId });
      return res.status(404).json({ message: 'Role not found' });
    }

    // Tenant check
    if (
      req.user.role !== 'admin' &&
      role.tenant &&
      role.tenant._id &&
      role.tenant._id.toString() !== req.tenantId
    ) {
      await logger.warn(
        'updateRole: Attempt to update role from different tenant',
        { tenantId: req.tenantId, roleTenant: role.tenant._id }
      );
      return res
        .status(403)
        .json({ message: 'Cannot update role from different tenant' });
    }

    // Validate permissions
    if (permissions && permissions.length > 0) {
      const validPermissions = await Permission.find({
        _id: { $in: permissions },
      });
      if (validPermissions.length !== permissions.length) {
        await logger.warn('updateRole: Invalid permission IDs provided', {
          providedCount: permissions.length,
          validCount: validPermissions.length,
        });
        return res.status(400).json({ message: 'Invalid permission IDs' });
      }
    }

    // --- Update Role ---
    role.name = name || role.name;
    role.permissions = permissions || role.permissions;
    role.description = description || role.description;
    role.tenant = tenantId || role.tenant;

    await role.save();
    await logger.info('updateRole: Role successfully updated', {
      roleId,
      updatedBy: req.user._id,
    });

    const updatedRole = await CustomRole.findById(roleId).populate(
      'permissions tenant'
    );

    return res.status(200).json({ message: 'Role updated', role: updatedRole });
  } catch (err) {
    await logger.error('updateRole: Error', {
      error: err.message,
      stack: err.stack,
    });
    next(err);
  }
};

// Delete a role
exports.deleteRole = async (req, res, next) => {
  try {
    const { error } = Joi.object({
      roleId: Joi.string().hex().length(24).required(),
    }).validate(req.params);

    if (error) {
      await logger.warn('deleteRole: Validation failed', {
        details: error.details[0],
      });
      return res.status(400).json({ message: error.details[0].message });
    }

    const { roleId } = req.params;
    await logger.info('deleteRole: Start deleting role', {
      roleId,
      performedBy: req.user._id,
      tenantId: req.tenantId,
    });

    // --- Role-based restrictions ---
    if (req.user.role === 'companyAdmin') {
      await logger.info('deleteRole: Request by companyAdmin', {
        adminId: req.user._id,
      });
    } else if (req.user.role === 'member') {
      const populatedUser = await User.findById(req.user._id).populate({
        path: 'customRoles',
        populate: { path: 'permissions' },
      });

      if (!populatedUser) {
        await logger.error('deleteRole: User not found', {
          userId: req.user._id,
        });
        return res.status(404).json({ message: 'User not found' });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === 'role:delete')
      );

      if (!hasPermission) {
        await logger.warn('deleteRole: Missing permission role:delete', {
          userId: req.user._id,
        });
        return res
          .status(403)
          .json({ message: "Access denied: Permission 'role:delete' required" });
      }
    } else {
      await logger.warn('deleteRole: Invalid role access attempt', {
        userRole: req.user.role,
      });
      return res.status(403).json({
        message:
          'Only companyAdmin or member (with permission) can delete roles',
      });
    }

    // --- Find Role ---
    const role = await CustomRole.findById(roleId).populate('tenant');
    if (!role) {
      await logger.warn('deleteRole: Role not found', { roleId });
      return res.status(404).json({ message: 'Role not found' });
    }

    // --- Tenant Scoping ---
    if (
      req.user.role !== 'admin' &&
      role.tenant &&
      role.tenant._id &&
      role.tenant._id.toString() !== req.tenantId
    ) {
      await logger.warn('deleteRole: Cross-tenant deletion attempt', {
        requestTenant: req.tenantId,
        roleTenant: role.tenant._id,
      });
      return res
        .status(403)
        .json({ message: 'Cannot delete role from different tenant' });
    }

    // --- Remove role from all users ---
    const updatedUsers = await User.updateMany(
      { customRoles: roleId },
      { $pull: { customRoles: roleId } }
    );
    await logger.info('deleteRole: Role removed from users', {
      roleId,
      affectedUsers: updatedUsers.modifiedCount,
    });

    // --- Delete role ---
    await CustomRole.findByIdAndDelete(roleId);
    await logger.info('deleteRole: Role deleted successfully', {
      roleId,
      deletedBy: req.user._id,
    });

    return res.status(200).json({ message: 'Role deleted successfully' });
  } catch (err) {
    await logger.error('deleteRole: Error', {
      error: err.message,
      stack: err.stack,
    });
    next(err);
  }
};

// Get users by role
exports.getUsersByRole = async (req, res, next) => {
  try {
    // --- Validate Params ---
    const { error } = getUsersByRoleSchema.validate(req.params);
    if (error) {
      await logger.warn("getUsersByRole: Validation failed", {
        details: error.details[0],
        performedBy: req.user?._id,
      });
      return res.status(400).json({ message: error.details[0].message });
    }

    const { roleId } = req.params;
    await logger.info("getUsersByRole: Start fetching users by role", {
      roleId,
      performedBy: req.user._id,
      tenantId: req.tenantId,
    });

    // --- Role-based restrictions ---
    if (req.user.role === "companyAdmin") {
      await logger.info("getUsersByRole: Access granted to companyAdmin", {
        userId: req.user._id,
      });
    } else if (req.user.role === "member") {
      const populatedUser = await User.findById(req.user._id).populate({
        path: "customRoles",
        populate: { path: "permissions" },
      });

      if (!populatedUser) {
        await logger.error("getUsersByRole: User not found", {
          userId: req.user._id,
        });
        return res.status(404).json({ message: "User not found" });
      }

      const hasPermission = populatedUser.customRoles?.some(
        (role) =>
          role.permissions &&
          role.permissions.some((p) => p.name === "role:read")
      );

      if (!hasPermission) {
        await logger.warn("getUsersByRole: Missing permission 'role:read'", {
          userId: req.user._id,
        });
        return res
          .status(403)
          .json({ message: "Access denied: Permission 'role:read' required" });
      }

      await logger.info("getUsersByRole: Member permission verified", {
        userId: req.user._id,
      });
    } else {
      await logger.warn("getUsersByRole: Unauthorized role access attempt", {
        userRole: req.user.role,
        userId: req.user._id,
      });
      return res.status(403).json({
        message:
          "Only companyAdmin or member (with permission) can view users by role",
      });
    }

    // --- Fetch Role + Users ---
    const role = await CustomRole.findById(roleId).populate(
      "tenant users",
      "name email _id"
    );

    if (!role) {
      await logger.warn("getUsersByRole: Role not found", { roleId });
      return res.status(404).json({ message: "Role not found" });
    }

    // --- Tenant Scoping ---
    if (
      req.user.role !== "admin" &&
      role.tenant &&
      role.tenant._id &&
      role.tenant._id.toString() !== req.tenantId
    ) {
      await logger.warn("getUsersByRole: Cross-tenant access attempt", {
        requestTenant: req.tenantId,
        roleTenant: role.tenant._id,
        performedBy: req.user._id,
      });
      return res
        .status(403)
        .json({ message: "Cannot view users for role from different tenant" });
    }

    // --- Success ---
    await logger.info("getUsersByRole: Users retrieved successfully", {
      roleId,
      totalUsers: role.users?.length || 0,
      requestedBy: req.user._id,
    });

    return res
      .status(200)
      .json({ message: "Users retrieved successfully", users: role.users || [] });
  } catch (err) {
    await logger.error("getUsersByRole: Error occurred", {
      error: err.message,
      stack: err.stack,
      performedBy: req.user?._id,
      tenantId: req.tenantId,
    });
    next(err);
  }
};
