// models/SurveyStats.js
const mongoose = require('mongoose');

const surveyStatsSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true, // One-to-one
  },
  totalSurveysTaken: { type: Number, default: 0 },
  totalResponses: { type: Number, default: 0 },
  averageScore: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('SurveyStats', surveyStatsSchema);