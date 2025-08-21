// models/Permission.js
// const mongoose = require("mongoose");

// const permissionSchema = new mongoose.Schema({
//   key: { type: String, required: true, unique: true }, // e.g. "survey.create"
//   name: { type: String },
//   description: { type: String }
// }, { timestamps: true });

const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Permission name is required"],
    trim: true,
    unique: true, // Global unique, e.g., "user:create"
  },
  description: {
    type: String,
    default: "",
  },
  // Optional: Group permissions (e.g., "user" group for all user-related)
  group: {
    type: String,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model("Permission", permissionSchema);