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
const { generateActionsFromFeedback } = require("./actionController")

// analyzeFeedback: analyze one or multiple responses (can be called on-demand or from webhook)
const analyzeSchema = Joi.object({
  responseIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
  runAllUnanalyzed: Joi.boolean().optional().default(false),
});

// helper
exports.analyzeFeedbackLogic = async (options, tenantId) => {
  console.log("🧠 Entering analyzeFeedbackLogic...");
  console.log("🧠 Options:", options);
  console.log("🏢 Tenant ID:", tenantId);

  try {
    const { responseIds, runAllUnanalyzed } = options;
    let responses = [];

    if (runAllUnanalyzed) {
      console.log("🔄 Running for all unanalyzed responses...");
      responses = await SurveyResponse.find({ tenant: tenantId }).lean();
      console.log("📊 Found responses:", responses.length);
    } else if (responseIds?.length) {
      console.log("🔍 Fetching specific responses...");
      responses = await SurveyResponse.find({ _id: { $in: responseIds }, tenant: tenantId }).lean();
      console.log("📊 Found responses:", responses.length);
    } else {
      const errMsg = "Provide responseIds or set runAllUnanalyzed=true";
      console.error("❌ Invalid options:", errMsg);
      throw new Error(errMsg);
    }

    const analyses = [];
    for (const resp of responses) {
      console.log("🔍 Processing response ID:", resp._id);
      const existing = await FeedbackAnalysis.findOne({ response: resp._id });
      if (existing) {
        console.log("⚠️ Skipped (already analyzed):", resp._id);
        analyses.push({ responseId: resp._id, status: "skipped", reason: "already analyzed" });
        continue;
      }

      const text = resp.review || (resp.answers || []).map(a => a.answer).join(" ");
      console.log("📝 Feedback Text:", text.substring(0, 100) + "..."); // Truncate for log

      const prompt = `Analyze sentiment... Feedback: ${text}`;
      console.log("🤖 Sending AI prompt...");

      let aiResult;
      try {
        aiResult = await aiClient.complete({ prompt, maxTokens: 200 });
        console.log("✅ AI Response:", aiResult.text?.substring(0, 100) + "...");
      } catch (err) {
        console.error("💥 AI Error:", err.message);
        aiResult = { text: null };
      }

      const aiText = aiResult?.text || aiResult?.choices?.[0]?.message?.content || "";
      let sentiment = "neutral";
      let categories = [];

      try {
        if (aiText) {
          const parsed = JSON.parse(aiText);
          sentiment = parsed.sentiment || sentiment;
          categories = parsed.categories || [];
          console.log("✅ Parsed Sentiment:", sentiment);
          console.log("✅ Categories:", categories);
        } else {
          sentiment = naiveSentiment(text);
          console.log("⚠️ Fallback Sentiment:", sentiment);
        }
      } catch {
        sentiment = naiveSentiment(text);
        console.log("⚠️ Fallback Sentiment (parse error):", sentiment);
      }

      const fa = await FeedbackAnalysis.create({
        response: resp._id,
        sentiment,
        categories,
        tenant: tenantId,
      });
      console.log("✅ FeedbackAnalysis Created ID:", fa._id);

      analyses.push({ responseId: resp._id, status: "analyzed", analysis: fa });

      if (fa.sentiment === "negative") {
        console.log("🚨 Negative Sentiment → Routing to actions...");
        await generateActionsFromFeedback({
          body: { feedbackIds: [fa._id] },
          user: { tenant: tenantId }
        });
        await sendNotification({ type: "negative_feedback", feedbackId: fa._id });
        console.log("✅ Routed negative feedback!");
      } else if (fa.sentiment === "positive") {
        console.log("🎉 Positive Sentiment → Sending thank-you...");
        await sendSurveyWhatsApp({ feedbackId: fa._id, messageType: "thank_you" });
        console.log("✅ Thank-you sent!");
      }
    }

    console.log("✅ Exiting analyzeFeedbackLogic with analyses count:", analyses.length);
    return analyses;
  } catch (err) {
    console.error("💥 Error in analyzeFeedbackLogic:", err.message);
    return { success: false, error: err.message };
  }
};

function naiveSentiment(text) {
  const lower = (text || "").toLowerCase();
  const negative = /(bad|poor|terrible|awful|disappoint|angry|hate|dissatisfied)/.test(lower);
  const positive = /(good|great|excellent|love|awesome|satisfied|happy|very awesome)/.test(lower);
  
  if (negative && positive) return "mixed"; // NEW
  if (negative) return "negative";
  if (positive) return "positive";
  return "neutral";
}

exports.analyzeFeedback = async (req, res, next) => {
  try {
    const { error, value } = analyzeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });
    const analyses = await exports.analyzeFeedbackLogic(value, req.tenantId);
    res.status(200).json({ message: "Analysis complete", analyses });
  } catch (err) {
    next(err);
  }
};

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

// exports.followUp = async (req, res, next) => {
//   try {
//     const { error, value } = followUpSchema.validate(req.body);
//     if (error) return res.status(400).json({ message: error.details[0].message });

//     const { actionIds, messageTemplate, method } = value;
//     const actions = await Action.find({ _id: { $in: actionIds }, tenant: req.tenantId }).populate({
//       path: "feedback",
//       populate: { path: "response", model: "SurveyResponse" },
//     });

//     const results = [];
//     for (const action of actions) {
//       // Determine contact: prefer response.user -> fetch user; else skip (or send to team)
//       const resp = action.feedback?.response;
//       let toEmail = null;
//       let toPhone = null;
//       if (resp?.user) {
//         const user = await User.findById(resp.user).select("email phone");
//         if (user) {
//           toEmail = user.email;
//           toPhone = user.phone;
//         }
//       }

//       // Simple templating: replace {{action}} and {{feedback}}
//       const message = messageTemplate
//         .replace(/\{\{action\}\}/g, action.description)
//         .replace(/\{\{feedback\}\}/g, resp?.review || "");

//       const sent = { actionId: action._id, email: null, sms: null };

//       if ((method === "email" || method === "both") && toEmail) {
//         await sendEmail({ to: toEmail, subject: "Follow-up regarding your feedback", html: `<p>${message}</p>` });
//         sent.email = true;
//       }
//       if ((method === "sms" || method === "both") && toPhone) {
//         if (!sendSMS) {
//           // sendSMS util not implemented
//           sent.sms = "sms util not configured";
//         } else {
//           await sendSMS({ to: toPhone, body: message });
//           sent.sms = true;
//         }
//       }

//       // Optionally mark action as "in-progress" or add note
//       action.status = action.status === "open" ? "in-progress" : action.status;
//       await action.save();

//       results.push(sent);
//     }

//     res.status(200).json({ message: "Follow-ups attempted", results });
//   } catch (err) {
//     next(err);
//   }
// };

exports.followUp = async ({ actionIds, messageTemplate, method = "email" }) => {
  console.log("📤 Entering followUp...");
  console.log("📤 Action IDs:", actionIds);
  console.log("📝 Message Template:", messageTemplate);

  try {
    const actions = await Action.find({ _id: { $in: actionIds } }).populate({
      path: "feedback",
      populate: { path: "response", model: "SurveyResponse" }
    });
    console.log("📊 Found actions:", actions.length);

    const results = [];
    for (const action of actions) {
      console.log("🔍 Processing action ID:", action._id);
      const resp = action.feedback?.response;
      let toEmail = null;
      let toPhone = null;
      if (resp?.user) {
        const user = await User.findById(resp.user).select("email phone");
        if (user) {
          toEmail = user.email;
          toPhone = user.phone;
          console.log("👤 User Contact:", { email: toEmail, phone: toPhone });
        }
      }

      const message = messageTemplate
        .replace(/\{\{action\}\}/g, action.description)
        .replace(/\{\{feedback\}\}/g, resp?.review || "");
      console.log("📝 Generated Message:", message);

      const sent = { actionId: action._id, email: null, sms: null };

      if ((method === "email" || method === "both") && toEmail) {
        await sendEmail({ to: toEmail, subject: "Follow-up on Feedback", html: `<p>${message}</p>` });
        sent.email = true;
        console.log("✅ Email Sent to:", toEmail);
      }
      if ((method === "sms" || method === "both") && toPhone) {
        await sendSMS({ to: toPhone, body: message });
        sent.sms = true;
        console.log("✅ SMS Sent to:", toPhone);
      }

      action.status = action.status === "open" ? "in-progress" : action.status;
      await action.save();
      console.log("✅ Action Status Updated:", action.status);

      results.push(sent);
    }

    console.log("✅ Exiting followUp with results count:", results.length);
    return results;
  } catch (err) {
    console.error("💥 Error in followUp:", err.message);
    throw err;
  }
};

// feedbackController.js
const sendSurveyWhatsApp = async ({ feedbackId, messageType }) => {
    console.log("📱 WhatsApp Thank-you (dummy):", { feedbackId, messageType });
    // Later: Integrate Twilio/WhatsApp API
};