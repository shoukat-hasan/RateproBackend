// models/PermissionAssignment.js
const mongoose = require('mongoose');

const permissionAssignmentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
  },
  permissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permission',
    required: [true, 'Permission is required'],
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: [true, 'Tenant is required'],
  },
}, { timestamps: true });

// Unique index to prevent duplicate assignments
permissionAssignmentSchema.index({ userId: 1, permissionId: 1, tenantId: 1 }, { unique: true });

module.exports = mongoose.model('PermissionAssignment', permissionAssignmentSchema);