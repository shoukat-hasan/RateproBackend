// models/Survey.js

const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  type: {
    type: String,
    enum: ["likert", "scale", "nps", "rating", "mcq", "yesno", "text"],
    required: true,
  },
  options: [String], // for mcq/likert etc.
  required: { type: Boolean, default: false },
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

    questions: [questionSchema],

    settings: {
      isPublic: { type: Boolean, default: true },
      isAnonymous: { type: Boolean, default: false },
      isPasswordProtected: { type: Boolean, default: false },
      password: { type: String }, // will be hashed
    },

    status: { type: String, enum: ["active", "inactive"], default: "active" },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    totalResponses: { type: Number, default: 0 },
    averageScore: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },

    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Survey", surveySchema);