// // // models/User.js
// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: [true, "Name is required"],
//       trim: true,
//     },
//     email: {
//       type: String,
//       required: [true, "Email is required"],
//       unique: true,
//       lowercase: true,
//     },
//     // Auth provider (local / google / github etc.)
//     authProvider: {
//       type: String,
//       enum: ["local", "google"],
//       default: "local",
//     },
//     // store googleId (sparse unique so null values are allowed)
//     googleId: {
//       type: String,
//       unique: true,
//       sparse: true,
//     },
//     // Password required only for local users
//     password: {
//       type: String,
//       required: function () {
//         return this.authProvider === "local";
//       },
//       minlength: 6,
//     },
//     phone: { type: String },
//     bio: { type: String, default: "" },
//     avatar: {
//       public_id: { type: String },
//       url: { type: String },
//     },
//     role: {
//       type: String,
//       enum: ["admin", "companyAdmin", "member", "user"],
//       default: "user", // default for public user
//     },
//     isVerified: {
//       type: Boolean,
//       default: false,
//     },
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//     // Auth Tokens
//     resetPasswordToken: String,
//     resetPasswordExpire: Date,
//     emailVerificationToken: String,
//     emailTokenExpire: Date,
//     // If role === "member", linked to a company
//     company: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: function () {
//         return this.role === "member";
//       },
//     },
//     // Who created this user (system admin or company super admin)
//     createdBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       default: null,
//     },
//     // Company Profile — only used if role === "companyAdmin"
//     companyProfile: {
//       name: { type: String },
//       contactEmail: { type: String },
//       contactPhone: { type: String },
//       website: { type: String },
//       address: { type: String },
//       totalEmployees: { type: Number },
//       departments: [
//         {
//           name: { type: String, required: true },
//           head: { type: String }, // Can be converted to user ref later
//         },
//       ],
//     },
//     department: {
//       type: String, // or ObjectId ref to a "Department" model later if needed
//       default: null,
//       required: function () {
//         return this.role === "member";
//       }
//     },
//     // Dashboard Stats — for survey activity or future analytics
//     surveyStats: {
//       totalSurveysTaken: { type: Number, default: 0 },
//       totalResponses: { type: Number, default: 0 },
//       averageScore: { type: Number, default: 0 },
//     },
//     deleted: {
//       type: Boolean,
//       default: false,
//     },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("User", userSchema);

// // models/User.js
// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema({
//   name: { type: String, required: [true, "Name required"], trim: true },
//   email: { type: String, required: [true, "Email required"], unique: true, lowercase: true },
//   password: { type: String, required: [true, "Password required"] },
//   avatar: {
//     public_id: { type: String },
//     url: { type: String }
//   },

//   // High-level type (quick checks)
//   role: { type: String, enum: ["admin", "company", "user"], default: "user" },

//   // Fine-grained roles/permissions
//   roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],

//   // Tenant / company association
//   tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },

//   isVerified: { type: Boolean, default: false },
//   isActive: { type: Boolean, default: true },
//   deleted: { type: Boolean, default: false },

//   resetPasswordToken: String,
//   resetPasswordExpire: Date,
//   emailVerificationToken: String,
//   emailTokenExpire: Date,

//   // quick stats (optional)
//   surveyStats: {
//     totalSurveysTaken: { type: Number, default: 0 },
//     totalResponses: { type: Number, default: 0 },
//     averageScore: { type: Number, default: 0 }
//   },

//   createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
// }, { timestamps: true });

// // Add indexes for common queries
// userSchema.index({ email: 1 });
// userSchema.index({ tenant: 1 });
// userSchema.index({ deleted: 1 });

// module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // Basic Info
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
    },

    // Auth Provider
    authProvider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Password
    password: {
      type: String,
      required: function () {
        return this.authProvider === "local";
      },
      minlength: 6,
    },

    // Profile Info
    phone: { type: String },
    bio: { type: String, default: "" },
    avatar: {
      public_id: { type: String },
      url: { type: String },
    },

    // High-level Role
    role: {
      type: String,
      enum: ["admin", "companyAdmin", "company", "member", "user"],
      default: "user",
    },

    // Fine-grained Roles/Permissions
    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: "Role" }],

    // Tenant / Company Association
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", default: null },

    // Company-specific Links
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.role === "member";
      },
    },

    department: {
      type: String,
      default: null,
      required: function () {
        return this.role === "member";
      },
    },

    // Company Profile — for "companyAdmin"
    companyProfile: {
      name: { type: String },
      contactEmail: { type: String },
      contactPhone: { type: String },
      website: { type: String },
      address: { type: String },
      totalEmployees: { type: Number },
      departments: [
        {
          name: { type: String, required: true },
          head: { type: String },
        },
      ],
    },

    // Status Flags
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    deleted: { type: Boolean, default: false },

    // Tokens
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    emailVerificationToken: String,
    emailTokenExpire: Date,

    // Stats
    surveyStats: {
      totalSurveysTaken: { type: Number, default: 0 },
      totalResponses: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 },
    },

    // Tracking
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for faster queries
userSchema.index({ email: 1 });
userSchema.index({ tenant: 1 });
userSchema.index({ deleted: 1 });

module.exports = mongoose.model("User", userSchema);