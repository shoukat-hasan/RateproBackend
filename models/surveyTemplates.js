// // RateproBackend/models/surveyTemplates.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  id: { type: String },
  questionText: { type: String, required: true },

  type: {
    type: String,
    enum: ["text", "textarea", "numeric", "email", "radio", "checkbox", "select", "imageChoice", "ranking", "matrix",
      "likert", "scale", "nps", "rating", "yesno", "date", "time", "datetime", "multiple_choice"
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

const surveyTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'corporate', 'education', 'healthcare', 'hospitality', 
      'sports', 'banking', 'retail', 'government', 
      'construction', 'automotive', 'technology'
    ]
  },
  categoryName: {
    type: String,
    required: true
  },
  questions: [questionSchema],
  estimatedTime: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft'
  },
  language: {
    type: [String],
    default: ['English']
  },
  tags: [String],
  isActive: {
    type: Boolean,
    default: true
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  usageCount: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 4.5
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
surveyTemplateSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('surveyTemplates', surveyTemplateSchema);