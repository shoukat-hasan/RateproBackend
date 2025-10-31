// controllers/actionController.js
const Action = require("../models/Action");
const FeedbackAnalysis = require("../models/FeedbackAnalysis");
const User = require("../models/User");
const Survey = require("../models/Survey");
const aiClient = require("../utils/aiClient");
const { sendNotification } = require("../utils/sendNotification");
const Joi = require("joi");
const followUp = require("./feedbackController")

// Validation schemas
const createActionSchema = Joi.object({
  feedbackId: Joi.string().hex().length(24).optional(),
  description: Joi.string().min(5).required(),
  priority: Joi.string().valid("high", "medium", "long-term").required(),
  assignedTo: Joi.string().hex().length(24).optional(),
  team: Joi.string().min(2).optional(),
  dueDate: Joi.date().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  category: Joi.string().optional()
});

const updateActionSchema = Joi.object({
  description: Joi.string().min(5).optional(),
  priority: Joi.string().valid("high", "medium", "long-term").optional(),
  assignedTo: Joi.string().hex().length(24).allow(null).optional(),
  team: Joi.string().min(2).optional(),
  status: Joi.string().valid("open", "in-progress", "resolved").optional(),
  dueDate: Joi.date().allow(null).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  category: Joi.string().optional(),
  resolution: Joi.string().optional(),
  completedAt: Joi.date().optional()
});

const bulkUpdateSchema = Joi.object({
  actionIds: Joi.array().items(Joi.string().hex().length(24)).min(1).required(),
  updates: Joi.object({
    priority: Joi.string().valid("high", "medium", "long-term").optional(),
    status: Joi.string().valid("open", "in-progress", "resolved").optional(),
    assignedTo: Joi.string().hex().length(24).allow(null).optional(),
    team: Joi.string().optional()
  }).min(1).required()
});

// @desc    Create new action
// @route   POST /api/actions
// @access  Private (companyAdmin, admin)
exports.createAction = async (req, res, next) => {
  try {
    const { error, value } = createActionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { feedbackId, description, priority, assignedTo, team, dueDate, tags, category } = value;

    // Validate feedback exists if provided
    if (feedbackId) {
      const feedback = await FeedbackAnalysis.findById(feedbackId);
      if (!feedback || feedback.tenant.toString() !== req.user.tenant.toString()) {
        return res.status(404).json({
          success: false,
          message: "Feedback not found"
        });
      }
    }

    // Validate assignee exists if provided
    if (assignedTo) {
      const assignee = await User.findById(assignedTo);
      if (!assignee || assignee.tenant.toString() !== req.user.tenant.toString()) {
        return res.status(404).json({
          success: false,
          message: "Assignee not found"
        });
      }
    }

    // Set auto due date based on priority
    let autoDueDate = dueDate;
    if (!autoDueDate) {
      const now = new Date();
      switch (priority) {
        case "high":
          autoDueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
          break;
        case "medium":
          autoDueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days
          break;
        case "long-term":
          autoDueDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
          break;
      }
    }

    const action = await Action.create({
      feedback: feedbackId || null,
      description,
      priority,
      assignedTo: assignedTo || null,
      team: team || null,
      tenant: req.user.tenant,
      dueDate: autoDueDate,
      tags: tags || [],
      category: category || "general",
      createdBy: req.user._id
    });

    await action.populate([
      { path: "feedback", select: "sentiment category summary" },
      { path: "assignedTo", select: "name email" },
      { path: "createdBy", select: "name email" }
    ]);

    // Send notification to assignee if assigned
    if (assignedTo) {
      await sendNotification({
        userId: assignedTo,
        type: "action_assigned",
        message: `New ${priority} priority action assigned: ${description}`,
        data: { actionId: action._id, priority, dueDate: autoDueDate }
      });
    }

    await updateDashboardMetrics(tenantId);

    res.status(201).json({
      success: true,
      message: "Action created successfully",
      data: action
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get all actions with filtering and pagination
// @route   GET /api/actions
// @access  Private
exports.getActions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      priority,
      status,
      assignedTo,
      team,
      category,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
      dateFrom,
      dateTo
    } = req.query;

    // Build filter query
    const filter = { tenant: req.user.tenant };

    if (priority && priority !== "all") {
      filter.priority = priority;
    }

    if (status && status !== "all") {
      filter.status = status;
    }

    if (assignedTo && assignedTo !== "all") {
      filter.assignedTo = assignedTo;
    }

    if (team && team !== "all") {
      filter.team = new RegExp(team, "i");
    }

    if (category && category !== "all") {
      filter.category = new RegExp(category, "i");
    }

    if (search) {
      filter.$or = [
        { description: new RegExp(search, "i") },
        { team: new RegExp(search, "i") },
        { category: new RegExp(search, "i") }
      ];
    }

    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) filter.createdAt.$gte = new Date(dateFrom);
      if (dateTo) filter.createdAt.$lte = new Date(dateTo);
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const sortQuery = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Execute queries
    const [actions, totalActions] = await Promise.all([
      Action.find(filter)
        .populate([
          { path: "feedback", select: "sentiment category summary" },
          { path: "assignedTo", select: "name email avatar" },
          { path: "createdBy", select: "name email" }
        ])
        .sort(sortQuery)
        .skip(skip)
        .limit(parseInt(limit)),
      Action.countDocuments(filter)
    ]);

    // Calculate analytics
    const analytics = await Action.aggregate([
      { $match: { tenant: req.user.tenant } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          high: { $sum: { $cond: [{ $eq: ["$priority", "high"] }, 1, 0] } },
          medium: { $sum: { $cond: [{ $eq: ["$priority", "medium"] }, 1, 0] } },
          longTerm: { $sum: { $cond: [{ $eq: ["$priority", "long-term"] }, 1, 0] } },
          open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
          inProgress: { $sum: { $cond: [{ $eq: ["$status", "in-progress"] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        actions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(totalActions / limit),
          total: totalActions,
          limit: parseInt(limit)
        },
        analytics: analytics[0] || {
          total: 0, high: 0, medium: 0, longTerm: 0,
          open: 0, inProgress: 0, resolved: 0
        }
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get action by ID
// @route   GET /api/actions/:id
// @access  Private
exports.getActionById = async (req, res, next) => {
  try {
    const action = await Action.findOne({
      _id: req.params.id,
      tenant: req.user.tenant
    }).populate([
      {
        path: "feedback",
        populate: {
          path: "survey",
          select: "title"
        }
      },
      { path: "assignedTo", select: "name email avatar department" },
      { path: "createdBy", select: "name email" }
    ]);

    if (!action) {
      return res.status(404).json({
        success: false,
        message: "Action not found"
      });
    }

    res.json({
      success: true,
      data: action
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Update action
// @route   PUT /api/actions/:id
// @access  Private (companyAdmin, admin, assigned member)
exports.updateAction = async (req, res, next) => {
  try {
    const { error, value } = updateActionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const action = await Action.findOne({
      _id: req.params.id,
      tenant: req.user.tenant
    });

    if (!action) {
      return res.status(404).json({
        success: false,
        message: "Action not found"
      });
    }

    // Check if user can update (admin, companyAdmin, or assigned member)
    const canUpdate = req.user.role === "admin" ||
      req.user.role === "companyAdmin" ||
      (action.assignedTo && action.assignedTo.toString() === req.user._id.toString());

    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this action"
      });
    }

    // Track status changes for notifications
    const oldStatus = action.status;
    const oldAssignee = action.assignedTo;

    // Update action
    Object.assign(action, value);

    // Set completion time if resolving
    if (value.status === "resolved" && oldStatus !== "resolved") {
      action.completedAt = new Date();
      action.completedBy = req.user._id;
    }

    await action.save();

    await action.populate([
      { path: "feedback", select: "sentiment category summary" },
      { path: "assignedTo", select: "name email avatar" },
      { path: "createdBy", select: "name email" },
      { path: "completedBy", select: "name email" }
    ]);

    // Send notifications for status changes
    if (oldStatus !== action.status) {
      if (action.assignedTo && action.assignedTo._id.toString() !== req.user._id.toString()) {
        await sendNotification({
          userId: action.assignedTo._id,
          type: "action_status_updated",
          message: `Action status updated to: ${action.status}`,
          data: { actionId: action._id, oldStatus, newStatus: action.status }
        });
      }
    }

    // Send notification for new assignment
    if (oldAssignee?.toString() !== action.assignedTo?.toString() && action.assignedTo) {
      await sendNotification({
        userId: action.assignedTo._id,
        type: "action_assigned",
        message: `Action assigned to you: ${action.description}`,
        data: { actionId: action._id, priority: action.priority }
      });
    }

    res.json({
      success: true,
      message: "Action updated successfully",
      data: action
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Delete action
// @route   DELETE /api/actions/:id
// @access  Private (companyAdmin, admin)
exports.deleteAction = async (req, res, next) => {
  try {
    const action = await Action.findOneAndDelete({
      _id: req.params.id,
      tenant: req.user.tenant
    });

    if (!action) {
      return res.status(404).json({
        success: false,
        message: "Action not found"
      });
    }

    res.json({
      success: true,
      message: "Action deleted successfully"
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Assign action to user
// @route   PUT /api/actions/:id/assign
// @access  Private (companyAdmin, admin)
exports.assignAction = async (req, res, next) => {
  try {
    const { assignedTo, team } = req.body;

    const action = await Action.findOne({
      _id: req.params.id,
      tenant: req.user.tenant
    });

    if (!action) {
      return res.status(404).json({
        success: false,
        message: "Action not found"
      });
    }

    // Validate assignee if provided
    if (assignedTo) {
      const assignee = await User.findById(assignedTo);
      if (!assignee || assignee.tenant.toString() !== req.user.tenant.toString()) {
        return res.status(404).json({
          success: false,
          message: "Assignee not found"
        });
      }
    }

    const oldAssignee = action.assignedTo;
    action.assignedTo = assignedTo || null;
    action.team = team || action.team;

    await action.save();
    await action.populate({ path: "assignedTo", select: "name email avatar" });

    // Send notification to new assignee
    if (assignedTo && oldAssignee?.toString() !== assignedTo) {
      await sendNotification({
        userId: assignedTo,
        type: "action_assigned",
        message: `New action assigned: ${action.description}`,
        data: { actionId: action._id, priority: action.priority }
      });
    }

    res.json({
      success: true,
      message: "Action assigned successfully",
      data: action
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get actions by priority
// @route   GET /api/actions/priority/:priority
// @access  Private
exports.getActionsByPriority = async (req, res, next) => {
  try {
    const { priority } = req.params;

    if (!["high", "medium", "long-term"].includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Invalid priority level"
      });
    }

    const actions = await Action.find({
      tenant: req.user.tenant,
      priority
    })
      .populate([
        { path: "assignedTo", select: "name email avatar" },
        { path: "feedback", select: "sentiment category" }
      ])
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: actions
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get actions by status
// @route   GET /api/actions/status/:status
// @access  Private
exports.getActionsByStatus = async (req, res, next) => {
  try {
    const { status } = req.params;

    if (!["open", "in-progress", "resolved"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status"
      });
    }

    const actions = await Action.find({
      tenant: req.user.tenant,
      status
    })
      .populate([
        { path: "assignedTo", select: "name email avatar" },
        { path: "feedback", select: "sentiment category" }
      ])
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: actions
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Get actions analytics
// @route   GET /api/actions/analytics/summary
// @access  Private (companyAdmin, admin)
exports.getActionsAnalytics = async (req, res, next) => {
  try {
    const { period = "30" } = req.query;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(period));

    const analytics = await Action.aggregate([
      {
        $match: {
          tenant: req.user.tenant,
          createdAt: { $gte: daysAgo }
        }
      },
      {
        $facet: {
          byPriority: [
            {
              $group: {
                _id: "$priority",
                count: { $sum: 1 },
                resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } }
              }
            }
          ],
          byStatus: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ],
          byTeam: [
            {
              $group: {
                _id: "$team",
                count: { $sum: 1 },
                resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } }
              }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
          ],
          timeline: [
            {
              $group: {
                _id: {
                  $dateToString: {
                    format: "%Y-%m-%d",
                    date: "$createdAt"
                  }
                },
                created: { $sum: 1 },
                resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } }
              }
            },
            { $sort: { _id: 1 } }
          ],
          overdue: [
            {
              $match: {
                dueDate: { $lt: new Date() },
                status: { $ne: "resolved" }
              }
            },
            { $count: "total" }
          ],
          avgResolutionTime: [
            {
              $match: {
                status: "resolved",
                completedAt: { $exists: true }
              }
            },
            {
              $project: {
                resolutionTime: {
                  $subtract: ["$completedAt", "$createdAt"]
                }
              }
            },
            {
              $group: {
                _id: null,
                avgTime: { $avg: "$resolutionTime" }
              }
            }
          ]
        }
      }
    ]);

    const result = analytics[0];

    res.json({
      success: true,
      data: {
        byPriority: result.byPriority,
        byStatus: result.byStatus,
        byTeam: result.byTeam,
        timeline: result.timeline,
        overdue: result.overdue[0]?.total || 0,
        avgResolutionTime: result.avgResolutionTime[0]?.avgTime || 0,
        period: parseInt(period)
      }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Bulk update actions
// @route   PUT /api/actions/bulk/update
// @access  Private (companyAdmin, admin)
exports.bulkUpdateActions = async (req, res, next) => {
  try {
    const { error, value } = bulkUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { actionIds, updates } = value;

    // Validate all actions exist and belong to tenant
    const actions = await Action.find({
      _id: { $in: actionIds },
      tenant: req.user.tenant
    });

    if (actions.length !== actionIds.length) {
      return res.status(404).json({
        success: false,
        message: "Some actions not found"
      });
    }

    // Perform bulk update
    const result = await Action.updateMany(
      {
        _id: { $in: actionIds },
        tenant: req.user.tenant
      },
      { $set: updates }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} actions updated successfully`,
      data: { modifiedCount: result.modifiedCount }
    });

  } catch (error) {
    next(error);
  }
};

// @desc    Generate actions from feedback using AI
// @route   POST /api/actions/generate/feedback
// @access  Private (companyAdmin, admin)
// exports.generateActionsFromFeedback = async (req, res, next) => {
//   try {
//     const { feedbackIds, options = {} } = req.body;

//     if (!feedbackIds || !Array.isArray(feedbackIds) || feedbackIds.length === 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Feedback IDs array required"
//       });
//     }

//     // Get feedback data
//     const feedbacks = await FeedbackAnalysis.find({
//       _id: { $in: feedbackIds },
//       tenant: req.user.tenant
//     }).populate("survey", "title");

//     if (feedbacks.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "No feedback found"
//       });
//     }

//     // Prepare AI prompt
//     const feedbackSummary = feedbacks.map(f => ({
//       id: f._id,
//       sentiment: f.sentiment,
//       category: f.category,
//       summary: f.summary,
//       survey: f.survey?.title
//     }));

//     const prompt = `
// Based on the following feedback analysis, generate actionable items to address the issues and improve customer satisfaction:

// ${JSON.stringify(feedbackSummary, null, 2)}

// For each action item, provide:
// 1. A clear, concise description (max 100 words)
// 2. Priority level (high/medium/long-term)
// 3. Suggested team or department
// 4. Category for the action

// Focus on:
// - Immediate fixes for high-impact negative feedback
// - Process improvements for recurring issues
// - Long-term strategic improvements

// Return a JSON array of action objects with fields: description, priority, team, category
// `;

//     try {
//       const aiResponse = await aiClient.complete({
//         prompt,
//         maxTokens: 1000
//       });

//       let suggestedActions;
//       try {
//         suggestedActions = JSON.parse(aiResponse.text);
//       } catch {
//         // Fallback parsing if AI returns non-JSON
//         suggestedActions = [
//           {
//             description: "Review and improve customer service processes based on feedback",
//             priority: "medium",
//             team: "Customer Service",
//             category: "Process Improvement"
//           }
//         ];
//       }

//       // Create actions in database
//       const createdActions = [];
//       for (const actionData of suggestedActions) {
//         try {
//           const action = await Action.create({
//             feedback: feedbacks[0]._id, // Link to first feedback for reference
//             description: actionData.description,
//             priority: actionData.priority || "medium",
//             team: actionData.team || "General",
//             category: actionData.category || "AI Generated",
//             tenant: req.user.tenant,
//             createdBy: req.user._id,
//             tags: ["ai-generated", "feedback-analysis"]
//           });

//           createdActions.push(action);
//         } catch (err) {
//           console.error("Error creating action:", err);
//         }
//       }

//       if (createdActions.length > 0) {
//         const actionIds = createdActions.map(a => a._id);
//         await followUp({ actionIds, messageTemplate: 'Your feedback received, we are on it!' });
//       }

//       res.json({
//         success: true,
//         message: `${createdActions.length} actions generated successfully`,
//         data: {
//           actions: createdActions,
//           feedbackProcessed: feedbacks.length
//         }
//       });

//     } catch (aiError) {
//       console.error("AI generation error:", aiError);

//       // Fallback: create basic actions
//       const fallbackActions = await Promise.all(
//         feedbacks.filter(f => f.sentiment === "negative").map(f =>
//           Action.create({
//             feedback: f._id,
//             description: `Address feedback concerns: ${f.summary?.substring(0, 100) || 'Review customer feedback'}`,
//             priority: "high",
//             team: "Customer Service",
//             category: "Customer Issue",
//             tenant: req.user.tenant,
//             createdBy: req.user._id,
//             tags: ["auto-generated", "negative-feedback"]
//           })
//         )
//       );
//       if (fallbackActions.length > 0) {
//         const actionIds = fallbackActions.map(a => a._id);
//         await followUp({ actionIds, messageTemplate: 'Your feedback received, we are on it!' });
//       }

//       res.json({
//         success: true,
//         message: `${fallbackActions.length} basic actions generated (AI unavailable)`,
//         data: {
//           actions: fallbackActions,
//           feedbackProcessed: feedbacks.length,
//           fallback: true
//         }
//       });
//     }

//   } catch (error) {
//     next(error);
//   }
// };
exports.generateActionsFromFeedback = async (req, res, next) => {
  console.log("🤖 Entering generateActionsFromFeedback...");
  console.log("🤖 Request Body:", req.body);

  try {
    const { feedbackIds, options = {} } = req.body;
    console.log("🔍 Feedback IDs:", feedbackIds);

    if (!feedbackIds || !Array.isArray(feedbackIds) || feedbackIds.length === 0) {
      console.error("❌ Invalid feedbackIds");
      return res.status(400).json({ success: false, message: "Feedback IDs array required" });
    }

    const feedbacks = await FeedbackAnalysis.find({
      _id: { $in: feedbackIds },
      tenant: req.user.tenant
    }).populate("survey", "title");
    console.log("📊 Found feedbacks:", feedbacks.length);

    if (feedbacks.length === 0) {
      console.log("❌ No feedback found");
      return res.status(404).json({ success: false, message: "No feedback found" });
    }

    const feedbackSummary = feedbacks.map(f => ({
      id: f._id,
      sentiment: f.sentiment,
      category: f.category,
      summary: f.summary,
      survey: f.survey?.title
    }));
    console.log("📝 Feedback Summary:", feedbackSummary);

    const prompt = `Based on the following... Return JSON array...`;
    console.log("🤖 Sending AI prompt...");

    try {
      const aiResponse = await aiClient.complete({ prompt, maxTokens: 1000 });
      console.log("✅ AI Response:", aiResponse.text?.substring(0, 100) + "...");

      let suggestedActions;
      try {
        suggestedActions = JSON.parse(aiResponse.text);
        console.log("✅ Parsed Actions:", suggestedActions.length);
      } catch {
        suggestedActions = [{ description: "Review customer service...", priority: "medium", team: "Customer Service", category: "Process Improvement" }];
        console.log("⚠️ Fallback parsing used");
      }

      const createdActions = [];
      for (const actionData of suggestedActions) {
        console.log("📝 Creating action for:", actionData.description);
        const action = await Action.create({
          feedback: feedbacks[0]._id,
          description: actionData.description,
          priority: actionData.priority || "medium",
          team: actionData.team || "General",
          category: actionData.category || "AI Generated",
          tenant: req.user.tenant,
          createdBy: req.user._id,
          tags: ["ai-generated", "feedback-analysis"]
        });
        createdActions.push(action);
        console.log("✅ Action Created ID:", action._id);
      }

      if (createdActions.length > 0) {
        const actionIds = createdActions.map(a => a._id);
        console.log("📤 Calling followUp with IDs:", actionIds);
        await followUp({ actionIds, messageTemplate: 'Your feedback received, we are on it!' });
        console.log("✅ Follow-up complete!");
      }

      res.json({ success: true, message: `${createdActions.length} actions generated`, data: { actions: createdActions, feedbackProcessed: feedbacks.length } });
      console.log("✅ Exiting with success!");
    } catch (aiError) {
      console.error("💥 AI Error:", aiError.message);

      const fallbackActions = await Promise.all(
        feedbacks.filter(f => f.sentiment === "negative").map(f => {
          console.log("⚠️ Fallback action for feedback:", f._id);
          return Action.create({
            feedback: f._id,
            description: `Address concerns: ${f.summary?.substring(0, 100) || 'Review feedback'}`,
            priority: "high",
            team: "Customer Service",
            category: "Customer Issue",
            tenant: req.user.tenant,
            createdBy: req.user._id,
            tags: ["auto-generated", "negative-feedback"]
          });
        })
      );
      console.log("⚠️ Fallback Actions Created:", fallbackActions.length);

      if (fallbackActions.length > 0) {
        const actionIds = fallbackActions.map(a => a._id);
        console.log("📤 Calling followUp (fallback):", actionIds);
        await followUp({ actionIds, messageTemplate: 'Your feedback received, we are on it!' });
        console.log("✅ Fallback follow-up complete!");
      }

      res.json({ success: true, message: `${fallbackActions.length} basic actions generated (AI unavailable)`, data: { actions: fallbackActions, feedbackProcessed: feedbacks.length, fallback: true } });
      console.log("✅ Exiting with fallback success!");
    }
  } catch (error) {
    console.error("💥 Error in generateActionsFromFeedback:", error.message);
    next(error);
  }
};