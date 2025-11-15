//  models/AuditLog.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  logLevel: {
    type: String,
    enum: ['INFO', 'WARNING', 'ERROR', 'DEBUG'],
    default: 'INFO'
  },
  functionName: {
    type: String,
    trim: true
  },
  message: {
    type: mongoose.Schema.Types.Mixed
  },
  // Naye fields add karein general logging ke liye
  action: {
    type: String,
    trim: true
  },
  description: {
    type: String
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'error']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  surveyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Survey',
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String, // ✅ STRING hona chahiye
    required: false
  },
  additionalData: { 
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  stackTrace: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better performance
logSchema.index({ functionName: 1 });
logSchema.index({ action: 1 });
logSchema.index({ logLevel: 1 });
logSchema.index({ status: 1 });
logSchema.index({ createdAt: -1 });
logSchema.index({ surveyId: 1 });
logSchema.index({ userId: 1 });

module.exports = mongoose.model('Logs', logSchema);