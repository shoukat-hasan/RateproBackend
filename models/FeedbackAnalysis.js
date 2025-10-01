// models/FeedbackAnalysis.js

const mongoose = require("mongoose");

const FeedbackAnalysisSchema = new mongoose.Schema({
    response: { type: mongoose.Schema.Types.ObjectId, ref: 'SurveyResponse', required: true },
    sentiment: { type: String, enum: ['positive', 'negative', 'neutral'], required: true },
    categories: [{ type: String }],
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
});

FeedbackAnalysisSchema.index({ tenant: 1 });
module.exports = mongoose.model('FeedbackAnalysis', FeedbackAnalysisSchema);