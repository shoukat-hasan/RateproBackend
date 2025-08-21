// // models/Role.js
// const mongoose = require("mongoose");

// const roleSchema = new mongoose.Schema({
//   name: { type: String, required: true, trim: true },
//   tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null }, // null = global/system role
//   permissions: [{ type: String }], // store permission keys as strings
//   description: { type: String },
//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
//   isDefault: { type: Boolean, default: false }
// }, { timestamps: true });

// module.exports = mongoose.model("Role", roleSchema);