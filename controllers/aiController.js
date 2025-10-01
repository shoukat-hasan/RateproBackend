// controllers/aiController.js
const Survey = require("../models/Survey");
const Tenant = require("../models/Tenant");
const { nanoid } = require("nanoid");
const aiClient = require("../utils/aiClient"); // implement wrapper for chosen LLM (OpenAI recommended)
const Joi = require("joi");
const { default: mongoose } = require("mongoose");

// Simple validation schemas
const draftSchema = Joi.object({
  goal: Joi.string().min(5).required(),
  industry: Joi.string().optional().allow(""),
  products: Joi.array().items(Joi.string()).optional(),
  tone: Joi.string().valid("friendly", "formal", "neutral", "casual", "professional").default("friendly"),
  language: Joi.string().valid("en", "ar", "both").default("en"),
  questionCount: Joi.number().integer().min(3).max(12).default(6),
  tenantId: Joi.string().hex().length(24).optional(),
  companyProfile: Joi.object().optional(),
  category: Joi.string().optional(),
  targetAudience: Joi.string().valid("customers", "employees", "vendors", "students", "event-attendees", "general").optional(),
  surveyType: Joi.string().valid("customer-feedback", "employee-feedback", "event-feedback", "nps", "satisfaction", "pulse").optional(),
  useTemplates: Joi.boolean().default(false),
  includeLogic: Joi.boolean().default(true)
});

const surveyLengthRules = {
  "customer-feedback": { min: 4, max: 8, avgTime: "3-5 minutes" },
  "employee-feedback": { min: 8, max: 15, avgTime: "7-10 minutes" },
  "event-feedback": { min: 4, max: 7, avgTime: "2-4 minutes" },
  "nps": { min: 2, max: 5, avgTime: "1-2 minutes" },
  "satisfaction": { min: 5, max: 10, avgTime: "4-6 minutes" },
  "pulse": { min: 3, max: 6, avgTime: "2-3 minutes" }
};

const industryTemplates = {
  "hospitality": {
    commonQuestions: [
      { type: "rating", text: "How would you rate your overall experience?", scale: "1-5" },
      { type: "nps", text: "How likely are you to recommend us to friends/family?" },
      { type: "mcq", text: "What did you enjoy the most?", options: ["Service Quality", "Cleanliness", "Staff Friendliness", "Value for Money", "Ambiance"] }
    ]
  },
  "automotive": {
    commonQuestions: [
      { type: "rating", text: "How satisfied were you with the service quality?", scale: "1-5" },
      { type: "mcq", text: "How did you book your appointment?", options: ["Online", "Phone", "Walk-in", "Mobile App"] },
      { type: "nps", text: "How likely are you to return for future services?" }
    ]
  },
  "education": {
    commonQuestions: [
      { type: "rating", text: "How relevant was the course content to your goals?", scale: "1-5" },
      { type: "rating", text: "How effective was the instructor's teaching?", scale: "1-5" },
      { type: "mcq", text: "Which topics would you like covered in future courses?", options: ["Technical Skills", "Soft Skills", "Industry Trends", "Certification Prep"] }
    ]
  },
  "retail": {
    commonQuestions: [
      { type: "rating", text: "How satisfied were you with your purchase?", scale: "1-5" },
      { type: "mcq", text: "How did you hear about us?", options: ["Social Media", "Friend Recommendation", "Google Search", "Advertisement", "Walk-by"] },
      { type: "nps", text: "How likely are you to recommend our store?" }
    ]
  }
};

const industryRulesSchema = new mongoose.Schema({
  industry: String,
  surveyLength: { min: Number, max: Number },
});

exports.aiDraftSurvey = async (req, res, next) => {
  console.log("📤 Sending AI Draft Request...");
  try {
    const { error, value } = draftSchema.validate(req.body);
    console.log(req.body)
    if (error) return res.status(400).json({ message: error.details[0].message });

    const {
      goal,
      industry,
      products,
      tone,
      language,
      questionCount,
      tenantId,
      targetAudience,
      surveyType,
      useTemplates,
      includeLogic
    } = value;

    // Optional: ensure tenant belongs to user (if provided)
    const tenant = tenantId ? await Tenant.findById(tenantId) : req.user.tenant;
    if (!tenant) return res.status(403).json({ message: "Tenant required or not found" });

    // Get survey length rules based on type
    const lengthRule = surveyLengthRules[surveyType] || surveyLengthRules["customer-feedback"];
    const adjustedQuestionCount = Math.min(Math.max(questionCount, lengthRule.min), lengthRule.max);

    // Get industry templates if available and requested
    const industryTemplate = useTemplates && industryTemplates[industry?.toLowerCase()];

    // Build enhanced AI prompt
    const prompt = [
      `You are an expert survey designer specializing in creating engaging, effective surveys.`,
      `Create a ${surveyType || "customer feedback"} survey with ${adjustedQuestionCount} questions for: "${goal}".`,
      industry ? `Industry: ${industry}.` : "",
      targetAudience ? `Target audience: ${targetAudience}.` : "",
      products && products.length ? `Products/Services: ${products.join(", ")}.` : "",
      tenant.companyName ? `Company: ${tenant.companyName}.` : "",

      // Question type requirements
      `Question types to include:`,
      `- 1 NPS question (0-10 scale): "How likely are you to recommend..."`,
      `- 2-3 Rating questions (1-5 stars): Service quality, satisfaction, etc.`,
      `- 1-2 Multiple choice: Preferences, categories, demographics`,
      `- 1 Open text: "What can we improve?" or "Additional comments"`,

      // Industry-specific guidance
      industryTemplate ? `Use these industry-proven questions as inspiration: ${JSON.stringify(industryTemplate.commonQuestions)}` : "",

      // Logic and flow
      includeLogic ? `Add conditional logic: If NPS ≤ 6, show follow-up "What can we improve?" If rating ≤ 2, show "How can we fix this?"` : "",

      // Formatting requirements
      `Return valid JSON only with structure:`,
      `{`,
      `  "title": "Survey Title",`,
      `  "description": "Brief intro (2-3 sentences)",`,
      `  "estimatedTime": "${lengthRule.avgTime}",`,
      `  "questions": [`,
      `    {`,
      `      "id": "unique_id",`,
      `      "type": "nps|rating|mcq|text|yesno",`,
      `      "questionText": "Question here",`,
      `      "options": ["opt1", "opt2"] (for mcq only),`,
      `      "required": true/false,`,
      `      "scale": "1-5" (for rating),`,
      `      "logic": {"condition": "value <= 6", "showQuestion": "followup_id"} (optional)`,
      `    }`,
      `  ]`,
      `}`,

      `Language: ${language === "both" ? "Provide Arabic translation in separate field" : language}.`,
      `Tone: ${tone} (adjust formality accordingly).`,
      `Survey length: ${lengthRule.avgTime} completion time.`
    ].join(" ");

    // Call LLM via aiClient (wrap your OpenAI or other provider)
    const aiResponse = await aiClient.complete({ prompt, maxTokens: 800 });

    // Expect aiResponse.text to contain JSON. Try parse; fallback to safe default template
    let suggestion;
    try {
      suggestion = JSON.parse(aiResponse.text);
    } catch (e) {
      // Enhanced fallback based on survey type and industry
      const fallbackQuestions = [];

      // Always include NPS
      fallbackQuestions.push({
        id: nanoid(),
        type: "nps",
        questionText: `How likely are you to recommend ${tenant.companyName || "us"} to others?`,
        scale: "0-10",
        required: true
      });

      // Add rating question
      fallbackQuestions.push({
        id: nanoid(),
        type: "rating",
        questionText: "How would you rate your overall experience?",
        scale: "1-5",
        required: true
      });

      // Industry-specific question
      if (industry) {
        const industryQ = industryTemplate?.commonQuestions?.[0];
        if (industryQ) {
          fallbackQuestions.push({
            id: nanoid(),
            type: industryQ.type,
            questionText: industryQ.text,
            scale: industryQ.scale,
            options: industryQ.options,
            required: true
          });
        }
      }

      // Multiple choice based on target audience
      if (targetAudience === "customers") {
        fallbackQuestions.push({
          id: nanoid(),
          type: "mcq",
          questionText: "What aspect was most important to you today?",
          options: ["Quality", "Service", "Value", "Convenience", "Other"],
          required: false
        });
      } else if (targetAudience === "employees") {
        fallbackQuestions.push({
          id: nanoid(),
          type: "mcq",
          questionText: "Which area would you like more support in?",
          options: ["Training", "Resources", "Communication", "Work-life balance", "Career development"],
          required: false
        });
      }

      // Always end with open text
      const improvementId = nanoid();
      fallbackQuestions.push({
        id: improvementId,
        type: "text",
        questionText: "What can we improve?",
        required: false
      });

      // Add logic if requested
      if (includeLogic && fallbackQuestions.length >= 2) {
        fallbackQuestions[0].logic = {
          condition: "value <= 6",
          showQuestion: improvementId
        };
      }

      suggestion = {
        title: `${surveyType === "nps" ? "NPS" : "Feedback"} Survey: ${goal.slice(0, 40)}`,
        description: `We value your opinion! Please take ${lengthRule.avgTime} to help us improve.`,
        estimatedTime: lengthRule.avgTime,
        questions: fallbackQuestions.slice(0, adjustedQuestionCount),
        metadata: {
          generatedBy: "fallback",
          industry: industry || "general",
          targetAudience: targetAudience || "general"
        }
      };
    }

    // Return draft (not saved) so frontend can show preview/allow edit
    res.status(200).json({ draft: suggestion });
  } catch (err) {
    console.error("Gemini failed:", err.message);
    return res.status(200).json({
      message: "AI temporarily unavailable, showing default draft",
      draft: [
        "How satisfied are you with your child’s academic progress?",
        "How effective do you find the school’s communication with parents?",
        "Are you satisfied with the quality of teachers?",
        "Do you feel your child receives enough extracurricular opportunities?",
        "Would you recommend this school to other parents?"
      ]
    });
  }
};

const suggestSchema = Joi.object({
  surveyId: Joi.string().hex().length(24).optional(),
  context: Joi.string().required(),
  questionCount: Joi.number().integer().min(1).max(5).default(1),
});

exports.aiSuggestQuestion = async (req, res, next) => {
  try {
    const { error, value } = suggestSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { surveyId, context, questionCount } = value;

    // If surveyId provided, load survey to give context
    let survey = null;
    if (surveyId) survey = await Survey.findById(surveyId).select("title questions translations");

    const prompt = [
      `You are a helpful assistant that suggests survey questions.`,
      `Context: ${context}`,
      survey ? `Survey title: ${survey.title}. Existing questions: ${JSON.stringify(survey.questions)}` : "",
      `Generate ${questionCount} candidate questions, with suggested type (rating, nps, likert, mcq, text) and short options if mcq. Return JSON array.`
    ].join(" ");

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 400 });

    let suggestions;
    try {
      suggestions = JSON.parse(aiResponse.text);
    } catch (e) {
      // fallback simple suggestion
      suggestions = [{ id: nanoid(), type: "text", questionText: context, required: false }];
    }

    res.status(200).json({ suggestions });
  } catch (err) {
    next(err);
  }
};

const optimizeSchema = Joi.object({
  surveyId: Joi.string().hex().length(24).required(),
});

exports.aiOptimizeSurvey = async (req, res, next) => {
  try {
    const { error, value } = optimizeSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { surveyId } = value;
    const survey = await Survey.findById(surveyId);
    if (!survey) return res.status(404).json({ message: "Survey not found" });

    // Prepare prompt: include questions, goal from title/description
    const rule = await IndustryRules.findOne({ industry: survey.category }) || { min: 5, max: 10 };
    const prompt = `Optimize this survey for response rate and clarity. 
      Limit questions between ${rule.min} and ${rule.max}. 
      Title: ${survey.title}. Description: ${survey.description}. 
      Questions: ${JSON.stringify(survey.questions)}. 
      Output JSON with suggestions: replaceQuestionIds[], rename suggestions, 
      and recommended question types/length.`;

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 600 });

    let optimized;
    try {
      optimized = JSON.parse(aiResponse.text);
    } catch (e) {
      optimized = { message: "AI optimization failed to parse. No changes." };
    }

    res.status(200).json({ optimized });
  } catch (err) {
    next(err);
  }
};

const translateSchema = Joi.object({
  text: Joi.string().required(),
  from: Joi.string().valid("en", "ar").default("en"),
  to: Joi.string().valid("en", "ar").required(),
});

exports.aiTranslateSurvey = async (req, res, next) => {
  try {
    const { error, value } = translateSchema.validate(req.body);
    if (error) return res.status(400).json({ message: error.details[0].message });

    const { text, from, to } = value;

    // Use aiClient translation or simple map
    const prompt = `Translate the following text from ${from} to ${to}. Preserve survey phrasing and keep translation concise. Return only the translated text:\n\n${text}`;

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 400 });

    const translated = aiResponse.text?.trim() || "";

    res.status(200).json({ translated });
  } catch (err) {
    next(err);
  }
};

// @desc    Generate survey from company profile
// @route   POST /api/ai/generate-from-profile
// @access  Private
exports.aiGenerateFromCompanyProfile = async (req, res, next) => {
  try {
    const { companyProfile, surveyGoal, questionCount, includeNPS, languages } = req.body;

    // Handle both authenticated and non-authenticated requests for testing
    const tenant = req.user?.tenant || null;

    const formatProducts = (products) => {
      if (Array.isArray(products)) return products.join(", ");
      if (typeof products === "string") return products;
      return "Not specified";
    };

    const prompt = `
Generate an optimized survey based on this company profile and goal:

Company Profile:
- Industry: ${companyProfile?.industry || 'General'}
- Products/Services: ${formatProducts(companyProfile?.products)}
- Target Audience: ${companyProfile?.targetAudience || 'customers'}
- Tone: ${companyProfile?.tone || 'friendly'}
Survey Goal: ${surveyGoal || 'Customer satisfaction survey'}
Question Count: ${questionCount || 6}
Languages: ${languages?.join(", ") || 'English'}
Include NPS: ${includeNPS !== false ? 'Yes' : 'No'}

Generate a JSON response with this structure:
{
  "success": true,
  "data": {
    "survey": {
      "title": "Survey Title",
      "description": "Survey description",
      "languages": ["English", "Arabic"]
    },
    "questions": [
      {
        "type": "rating",
        "title": "Question title",
        "description": "Question description", 
        "required": true,
        "options": [],
        "settings": {"scale": 5}
      }
    ]
  }
}

Question types available: rating, single_choice, multiple_choice, text_short, text_long, nps, likert, yes_no, date, number

Make questions industry-specific and relevant to the survey goal.
`;

    console.log("🚀 AI Prompt =>", prompt);

    const aiResponse = await aiClient.complete({ prompt });
    
    let result;
    try {
      result = JSON.parse(aiResponse.text);
    } catch (e) {
      // Fallback if AI doesn't return proper JSON
      result = {
        success: true,
        data: {
          survey: {
            title: `${companyProfile?.industry || 'Customer'} Feedback Survey`,
            description: `Professional survey for ${companyProfile?.industry || 'general'} industry to gather valuable insights.`,
            languages: languages || ['English']
          },
          questions: [
            {
              type: "rating",
              title: "Overall Experience Rating",
              description: "How would you rate your overall experience?",
              required: true,
              options: [],
              settings: { scale: 5 }
            },
            {
              type: "single_choice",
              title: "Primary Purpose",
              description: "What was the main reason for your visit/interaction?",
              required: true,
              options: ["Purchase", "Information", "Support", "Complaint", "Other"]
            },
            {
              type: "nps",
              title: "Recommendation Likelihood",
              description: "How likely are you to recommend us to friends or colleagues?",
              required: true,
              options: [],
              settings: { scale: 10 }
            },
            {
              type: "text_long",
              title: "Additional Comments",
              description: "Please share any additional feedback or suggestions.",
              required: false,
              options: []
            }
          ]
        }
      };
    }

    res.json(result);
  } catch (error) {
    console.error('AI Generate From Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate survey from company profile',
      error: error.message
    });
  }
};

// @desc    Suggest conditional logic for survey
// @route   POST /api/ai/suggest-logic
// @access  Private
exports.aiSuggestLogic = async (req, res, next) => {
  try {
    const { questions, surveyGoal } = req.body;

    const prompt = `
For this survey with goal "${surveyGoal}", suggest conditional logic rules:

Questions: ${JSON.stringify(questions)}

Suggest:
1. Skip logic (if answer X, skip to question Y)
2. Follow-up questions (if negative rating, ask why)
3. Branching paths (different questions for different user types)
4. Validation rules

Return JSON with logic suggestions.
`;

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 600 });

    let logicSuggestions;
    try {
      logicSuggestions = JSON.parse(aiResponse.text);
    } catch (e) {
      logicSuggestions = {
        skipLogic: [],
        followUps: [
          {
            condition: "rating <= 2",
            action: "show_question",
            question: "What specifically caused the poor rating?"
          }
        ],
        branching: [],
        validation: []
      };
    }

    res.json({ success: true, data: logicSuggestions });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate thank you page content
// @route   POST /api/ai/generate-thankyou
// @access  Private
exports.aiGenerateThankYouPage = async (req, res, next) => {
  try {
    const { surveyType, companyName, tone = "friendly", includeIncentives = false } = req.body;

    const prompt = `
Create a thank you page for a ${surveyType} survey from ${companyName}.
Tone: ${tone}
${includeIncentives ? "Include mention of reward/incentive" : ""}

Provide:
1. Thank you message
2. What happens next
3. Contact information encouragement
4. Social media follow suggestion
${includeIncentives ? "5. Reward/discount offer" : ""}

Return JSON with content sections.
`;

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 400 });

    let thankYouContent;
    try {
      thankYouContent = JSON.parse(aiResponse.text);
    } catch (e) {
      thankYouContent = {
        title: "Thank You!",
        message: `Thank you for taking the time to share your feedback with ${companyName}. Your input helps us improve our services.`,
        nextSteps: "We'll review your feedback and use it to enhance your future experience.",
        contact: "If you have any immediate concerns, please contact us at support@company.com",
        social: `Follow us on social media for updates and news from ${companyName}!`
      };
    }

    res.json({ success: true, data: thankYouContent });
  } catch (error) {
    next(error);
  }
};

// @desc    Analyze feedback with AI
// @route   POST /api/ai/analyze-feedback
// @access  Private
exports.aiAnalyzeFeedback = async (req, res, next) => {
  try {
    const { responses, surveyTitle } = req.body;

    if (!responses || !Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Responses array required"
      });
    }

    const prompt = `
Analyze these survey responses for "${surveyTitle}":

${JSON.stringify(responses.slice(0, 50))} // Limit for token management

Provide:
1. Overall sentiment (positive/neutral/negative)
2. Key themes and topics
3. Common complaints or issues
4. Positive highlights
5. Actionable insights
6. Priority recommendations

Return structured JSON analysis.
`;

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 800 });

    let analysis;
    try {
      analysis = JSON.parse(aiResponse.text);
    } catch (e) {
      analysis = {
        sentiment: "neutral",
        themes: ["service quality", "customer satisfaction"],
        complaints: ["waiting time", "unclear information"],
        highlights: ["friendly staff", "good value"],
        insights: ["Improve response time", "Enhance communication clarity"],
        recommendations: [
          { priority: "high", action: "Reduce wait times" },
          { priority: "medium", action: "Staff training on communication" }
        ]
      };
    }

    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate insights and action items
// @route   POST /api/ai/generate-insights
// @access  Private
exports.aiGenerateInsights = async (req, res, next) => {
  try {
    const { surveyData, timeframe = "month", companyGoals = [] } = req.body;

    const prompt = `
Generate business insights from this survey data over the past ${timeframe}:

Survey Data: ${JSON.stringify(surveyData)}
Company Goals: ${companyGoals.join(", ")}

Provide:
1. Performance trends
2. Areas of improvement
3. Strengths to maintain
4. Predictive insights
5. Specific action items with priority
6. ROI impact estimates

Return JSON with structured insights.
`;

    const aiResponse = await aiClient.complete({ prompt, maxTokens: 1000 });

    let insights;
    try {
      insights = JSON.parse(aiResponse.text);
    } catch (e) {
      insights = {
        trends: {
          satisfaction: "stable",
          nps: "improving",
          completion_rate: "declining"
        },
        improvements: [
          "Streamline survey length",
          "Improve mobile experience",
          "Add more relevant questions"
        ],
        strengths: [
          "High customer loyalty",
          "Strong product quality ratings"
        ],
        predictions: [
          "NPS likely to increase by 5 points if wait times reduced"
        ],
        actions: [
          {
            priority: "high",
            action: "Reduce survey length to under 5 questions",
            impact: "Increase completion rate by 15%",
            effort: "low"
          }
        ]
      };
    }

    res.json({ success: true, data: insights });
  } catch (error) {
    next(error);
  }
};
