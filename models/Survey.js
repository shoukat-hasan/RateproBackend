// models/Survey.js
const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  id: { type: String },
  questionText: { type: String, required: true },

  type: {
    type: String,
    enum: ["text", "textarea", "numeric", "email", "radio", "checkbox", "select", "imageChoice", "ranking", "matrix",
      "likert", "scale", "nps", "rating", "yesno", "date", "time", "datetime", "multiple_choice",
    ],
    required: true,
  },

  options: [String], // for mcq/choice/imageChoice/ranking etc.
  required: { type: Boolean, default: false },

  translations: {
    en: { questionText: String, options: [String] },
    ar: { questionText: String, options: [String] },
  },

  language: { type: String, enum: ["en", "ar"], default: "en" },

  // 🔥 Smart Logic Branching (Simplified)
  logicRules: [
    {
      condition: {
        operator: { type: String, enum: ["equals", "notEquals", "greaterThan", "lessThan", "includes"] },
        value: { type: mongoose.Schema.Types.Mixed }, // string/number/array
      },
      nextQuestionId: { type: String }, // string reference to another question.id
    },
  ],
});

const surveySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    category: { type: String }, // e.g., Feedback, Product, HR
    logo: {
      public_id: String,
      url: String,
    },
    themeColor: { type: String, default: "#0047AB" }, // for customization

    translations: {
      en: { title: String, description: String },
      ar: { title: String, description: String },
    },

    questions: [questionSchema],

    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", required: true },

    settings: {
      isPublic: { type: Boolean, default: true },
      isAnonymous: { type: Boolean, default: false },
      isPasswordProtected: { type: Boolean, default: false },
      password: { type: String }, // will be hashed
    },

    status: { type: String, enum: ["active", "inactive", "draft"], default: "active" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    totalResponses: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },

    deleted: { type: Boolean, default: false },

    thankYouPage: {
      message: { type: String, default: "Thank you for your feedback!" },
      qrCode: {
        enabled: { type: Boolean, default: false },
        url: { type: String }, // QR se redirect hone wala link
      },
      redirectUrl: { type: String }, // optional redirect after submit
    },
  },
  { timestamps: true }
);

surveySchema.index({ tenant: 1 });

module.exports = mongoose.model("Survey", surveySchema);

