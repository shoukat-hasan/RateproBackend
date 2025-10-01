// controllers/feedbackController.js
const Survey = require("../models/Survey");
const SurveyResponse = require("../models/SurveyResponse");
const FeedbackAnalysis = require("../models/FeedbackAnalysis");
const Action = require("../models/Action");
const User = require("../models/User");
const aiClient = require("../utils/aiClient");
const sendEmail = require("../utils/sendEmail");
const sendSMS = require("../utils/sendSMS"); // optional helper to implement
const Joi = require("joi");

// analyzeFeedback: analyze one or multiple responses (can be called on-demand or from webhook)
const analyzeSchema = Joi.object({
  responseIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
  runAllUnanalyzed: Joi.boolean().optional().default(false),
});

exports.analyzeFeedback = async (req, res, next) => {
  try {
    const { error, value } = analyzeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    let responses = [];
    if (value.runAllUnanalyzed) {
      responses = await SurveyResponse.find({ tenant: req.tenantId }).lean();
    } else if (value.responseIds && value.responseIds.length) {
      responses = await SurveyResponse.find({ _id: { $in: value.responseIds }, tenant: req.tenantId }).lean();
    } else {
      return res.status(400).json({ message: "Provide responseIds or runAllUnanalyzed=true" });
    }

    const analyses = [];
    for (const resp of responses) {
      // Simple guard: skip if already analyzed
      const existing = await FeedbackAnalysis.findOne({ response: resp._id });
      if (existing) {
        analyses.push({ responseId: resp._id, status: "skipped", reason: "already analyzed" });
        continue;
      }

      // Build prompt for sentiment + categories
      const text = resp.review || (resp.answers || []).map(a => a.answer).join(" ");
      const prompt = `Analyze sentiment (positive/negative/neutral) and top categories (max 3) for this feedback. Return JSON: { sentiment: "...", categories: ["..."] }\n\nFeedback: ${text}`;

      let aiResult;
      try {
        aiResult = await aiClient.complete({ prompt, maxTokens: 200 });
      } catch (err) {
        // fallback naive sentiment
        aiResult = { text: null };
      }

      let sentiment = "neutral";
      let categories = [];
      if (aiResult.text) {
        try {
          const parsed = JSON.parse(aiResult.text);
          sentiment = parsed.sentiment || sentiment;
          categories = parsed.categories || [];
        } catch (e) {
          // fallback simple keywords
          const lower = (text || "").toLowerCase();
          if (/(bad|poor|terrible|awful|disappoint)/.test(lower)) sentiment = "negative";
          else if (/(good|great|excellent|love|awesome)/.test(lower)) sentiment = "positive";
          categories = [];
        }
      }

      const fa = await FeedbackAnalysis.create({
        response: resp._id,
        sentiment,
        categories,
        tenant: req.tenantId,
      });

      analyses.push({ responseId: resp._id, status: "analyzed", analysis: fa });
    }

    res.status(200).json({ message: "Analysis complete", analyses });
  } catch (err) {
    next(err);
  }
};

// generateActions: produce actionable tasks from FeedbackAnalysis
const generateSchema = Joi.object({
  feedbackIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
  autoAssignTo: Joi.string().optional(), // userId to assign or team string
});

exports.generateActions = async (req, res, next) => {
  try {
    const { error, value } = generateSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const feedbacks = value.feedbackIds && value.feedbackIds.length
      ? await FeedbackAnalysis.find({ _id: { $in: value.feedbackIds }, tenant: req.tenantId }).populate('response')
      : await FeedbackAnalysis.find({ tenant: req.tenantId, createdAt: { $gte: new Date(0) } }).populate('response');

    const created = [];
    for (const fb of feedbacks) {
      // Simple mapping rules (can be replaced by AI)
      let priority = "medium";
      if (fb.sentiment === "negative") priority = "high";
      if (fb.categories && fb.categories.includes("safety")) priority = "high";

      const action = await Action.create({
        feedback: fb._id,
        description: `Follow up on: ${fb.categories?.join(", ") || "General feedback"}. Response excerpt: ${fb.response?.review?.slice(0, 200) || ""}`,
        priority,
        assignedTo: value.autoAssignTo || null,
        team: fb.categories?.[0] || "operations",
        tenant: req.tenantId,
        status: "open",
      });

      created.push(action);
    }

    res.status(201).json({ message: "Actions generated", actions: created });
  } catch (err) {
    next(err);
  }
};

// followUp: send notifications (email/SMS) based on action/feedback
const followUpSchema = Joi.object({
  actionIds: Joi.array().items(Joi.string().hex().length(24)).required(),
  messageTemplate: Joi.string().required(),
  method: Joi.string().valid("email", "sms", "both").default("email"),
});

exports.followUp = async (req, res, next) => {
  try {
    const { error, value } = followUpSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { actionIds, messageTemplate, method } = value;
    const actions = await Action.find({ _id: { $in: actionIds }, tenant: req.tenantId }).populate({
      path: "feedback",
      populate: { path: "response", model: "SurveyResponse" },
    });

    const results = [];
    for (const action of actions) {
      // Determine contact: prefer response.user -> fetch user; else skip (or send to team)
      const resp = action.feedback?.response;
      let toEmail = null;
      let toPhone = null;
      if (resp?.user) {
        const user = await User.findById(resp.user).select("email phone");
        if (user) {
          toEmail = user.email;
          toPhone = user.phone;
        }
      }

      // Simple templating: replace {{action}} and {{feedback}}
      const message = messageTemplate
        .replace(/\{\{action\}\}/g, action.description)
        .replace(/\{\{feedback\}\}/g, resp?.review || "");

      const sent = { actionId: action._id, email: null, sms: null };

      if ((method === "email" || method === "both") && toEmail) {
        await sendEmail({ to: toEmail, subject: "Follow-up regarding your feedback", html: `<p>${message}</p>` });
        sent.email = true;
      }
      if ((method === "sms" || method === "both") && toPhone) {
        if (!sendSMS) {
          // sendSMS util not implemented
          sent.sms = "sms util not configured";
        } else {
          await sendSMS({ to: toPhone, body: message });
          sent.sms = true;
        }
      }

      // Optionally mark action as "in-progress" or add note
      action.status = action.status === "open" ? "in-progress" : action.status;
      await action.save();

      results.push(sent);
    }

    res.status(200).json({ message: "Follow-ups attempted", results });
  } catch (err) {
    next(err);
  }
};
