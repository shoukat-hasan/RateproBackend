// models/Action.js

const mongoose = require("mongoose");

const ActionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    feedback: { type: mongoose.Schema.Types.ObjectId, ref: 'FeedbackAnalysis' },
    description: { type: String, required: true },
    priority: { type: String, enum: ['high', 'medium', 'low', 'long-term'], required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    team: { type: String },
    department: { type: String }, // For auto-assignment from AI analysis
    status: { type: String, enum: ['pending', 'open', 'in-progress', 'resolved'], default: 'pending' },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    
    // Enhanced fields
    dueDate: { type: Date },
    completedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Allow null for system-generated
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    category: { type: String, default: 'general' },
    tags: [{ type: String }],
    resolution: { type: String },
    
    // Auto-generation metadata (Flow.md Section 7)
    source: { type: String, enum: ['manual', 'survey_feedback', 'ai_generated'], default: 'manual' },
    metadata: {
        surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey' },
        responseId: { type: mongoose.Schema.Types.ObjectId, ref: 'SurveyResponse' },
        sentiment: { type: String, enum: ['positive', 'neutral', 'negative'] },
        confidence: { type: Number, min: 0, max: 1 },
        urgency: { type: String, enum: ['low', 'medium', 'high'] }
    },
    
    // Metadata
    estimatedHours: { type: Number },
    actualHours: { type: Number },
    
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
ActionSchema.index({ tenant: 1, status: 1 });
ActionSchema.index({ tenant: 1, priority: 1 });
ActionSchema.index({ tenant: 1, assignedTo: 1 });
ActionSchema.index({ tenant: 1, dueDate: 1 });
ActionSchema.index({ tenant: 1, createdAt: -1 });

// Virtual for checking if overdue
ActionSchema.virtual('isOverdue').get(function() {
    return this.dueDate && this.status !== 'resolved' && new Date() > this.dueDate;
});

// Virtual for resolution time
ActionSchema.virtual('resolutionTime').get(function() {
    if (this.completedAt && this.createdAt) {
        return this.completedAt - this.createdAt;
    }
    return null;
});

// Pre-save middleware
ActionSchema.pre('save', function(next) {
    if (this.status === 'resolved' && !this.completedAt) {
        this.completedAt = new Date();
    }
    next();
});

module.exports = mongoose.model('Action', ActionSchema);