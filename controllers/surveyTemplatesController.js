// surveyTemplatesControllers

const surveyTemplates = require("../models/surveyTemplates.js");

// @desc    Get all survey templates (with filters)
// @route   GET /api/survey-templates
// @access  Private (All authenticated users)
exports.getAllSurveyTemplates = async (req, res) => {
  try {
    const {
      category,
      language,
      search,
      sortBy = 'popular',
      page = 1,
      limit = 12
    } = req.query;

    // Build filter object
    let filter = { isActive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (language && language !== 'all') {
      filter.language = { $in: [new RegExp(language, 'i')] };
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Build sort object
    let sort = {};
    switch (sortBy) {
      case 'popular':
        sort = { usageCount: -1 };
        break;
      case 'rating':
        sort = { rating: -1 };
        break;
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'alphabetical':
        sort = { name: 1 };
        break;
      default:
        sort = { usageCount: -1 };
    }

    const skip = (page - 1) * limit;

    // Get templates with pagination
    const templates = await surveyTemplates.find(filter)
      .populate('createdBy', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const total = await surveyTemplates.countDocuments(filter);

    res.json({
      success: true,
      data: templates,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching templates'
    });
  }
};

// @desc    Get single survey template
// @route   GET /api/survey-templates/:id
// @access  Private (All authenticated users)
exports.getSurveyTemplateById = async (req, res) => {
  try {
    const template = await surveyTemplates.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Survey template not found'
      });
    }

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching template'
    });
  }
};

// @desc    Create new survey template
// @route   POST /api/survey-templates
// @access  Private (Super Admin only)
exports.createSurveyTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      categoryName,
      questions,
      estimatedTime,
      language,
      tags,
      isPremium
    } = req.body;

    // Check if template with same name already exists
    const existingTemplate = await surveyTemplates.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });

    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        message: 'A template with this name already exists'
      });
    }

    const template = new surveyTemplates({
      name,
      description,
      category,
      categoryName,
      questions,
      estimatedTime,
      language: language || ['English'],
      tags: tags || [],
      isPremium: isPremium || false,
      createdBy: req.user.id
    });

    const savedTemplate = await template.save();
    await savedTemplate.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Survey template created successfully',
      data: savedTemplate
    });
  } catch (error) {
    console.error('Create template error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(val => val.message).join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while creating template'
    });
  }
};

// @desc    Update survey template
// @route   PUT /api/survey-templates/:id
// @access  Private (Super Admin only)
exports.updateSurveyTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      categoryName,
      questions,
      estimatedTime,
      language,
      tags,
      isPremium,
      isActive
    } = req.body;

    // Check if template exists
    let template = await surveyTemplates.findById(req.params.id);
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Survey template not found'
      });
    }

    // Check if name is being changed and if it conflicts with existing template
    if (name && name !== template.name) {
      const existingTemplate = await surveyTemplates.findOne({ 
        name: { $regex: new RegExp(`^${name}$`, 'i') },
        _id: { $ne: req.params.id }
      });

      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          message: 'A template with this name already exists'
        });
      }
    }

    // Update template
    const updateData = {
      ...(name && { name }),
      ...(description && { description }),
      ...(category && { category }),
      ...(categoryName && { categoryName }),
      ...(questions && { questions }),
      ...(estimatedTime && { estimatedTime }),
      ...(language && { language }),
      ...(tags && { tags }),
      ...(isPremium !== undefined && { isPremium }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: Date.now()
    };

    template = await surveyTemplates.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    res.json({
      success: true,
      message: 'Survey template updated successfully',
      data: template
    });
  } catch (error) {
    console.error('Update template error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(val => val.message).join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Server error while updating template'
    });
  }
};

// @desc    Delete survey template (soft delete)
// @route   DELETE /api/survey-templates/:id
// @access  Private (Super Admin only)
exports.deleteSurveyTemplate = async (req, res) => {
  try {
    const template = await surveyTemplates.findById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Survey template not found'
      });
    }

    // Soft delete by setting isActive to false
    template.isActive = false;
    await template.save();

    res.json({
      success: true,
      message: 'Survey template deleted successfully'
    });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting template'
    });
  }
};

// @desc    Increment usage count for template
// @route   PATCH /api/survey-templates/:id/use
// @access  Private (Super Admin & Company Admin)
exports.useSurveyTemplate = async (req, res) => {
  try {
    const template = await surveyTemplates.findByIdAndUpdate(
      req.params.id,
      { $inc: { usageCount: 1 } },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Survey template not found'
      });
    }

    res.json({
      success: true,
      message: 'Usage count updated',
      data: { usageCount: template.usageCount }
    });
  } catch (error) {
    console.error('Update usage count error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating usage count'
    });
  }
};

// @desc    Preview survey template with sample data
// @route   GET /api/survey-templates/:id/preview
// @access  Private (All authenticated users)
exports.previewSurveyTemplate = async (req, res) => {
  try {
    const template = await surveyTemplates.findById(req.params.id)
      .populate('createdBy', 'name email');

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Survey template not found'
      });
    }

    // Return template with preview data
    res.json({
      success: true,
      data: {
        ...template.toObject(),
        preview: true,
        sampleQuestions: template.questions.slice(0, 3) // Show first 3 questions as preview
      }
    });
  } catch (error) {
    console.error('Preview template error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while previewing template'
    });
  }
};