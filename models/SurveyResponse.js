// models/SurveyResponse.js

const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  answer: mongoose.Schema.Types.Mixed, // string, number, etc.
});

const surveyResponseSchema = new mongoose.Schema(
  {
    survey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Survey",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    answers: [answerSchema],
    review: { type: String },
    score: { type: Number }, // 0–100
    rating: { type: Number }, // 1–5
    submittedAt: { type: Date, default: Date.now },

    isAnonymous: { type: Boolean, default: false },
    ip: { type: String }, // for public + anonymous tracking

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // optional
  },
  { timestamps: true }
);

module.exports = mongoose.model("SurveyResponse", surveyResponseSchema);