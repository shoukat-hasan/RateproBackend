// // models/User.js
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
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
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    phone: { type: String },
    bio: { type: String, default: "" },
    avatar: {
      public_id: { type: String },
      url: { type: String },
    },
    role: {
      type: String,
      enum: ["admin", "companyAdmin", "member", "user"],
      default: "user", // default for public user
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Auth Tokens
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    emailVerificationToken: String,
    emailTokenExpire: Date,
    // If role === "member", linked to a company
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: function () {
        return this.role === "member";
      },
    },
    // Who created this user (system admin or company super admin)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Company Profile — only used if role === "companyAdmin"
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
          head: { type: String }, // Can be converted to user ref later
        },
      ],
    },
    department: {
      type: String, // or ObjectId ref to a "Department" model later if needed
      default: null,
      required: function () {
        return this.role === "member";
      }
    },
    // Dashboard Stats — for survey activity or future analytics
    surveyStats: {
      totalSurveysTaken: { type: Number, default: 0 },
      totalResponses: { type: Number, default: 0 },
      averageScore: { type: Number, default: 0 },
    },
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);