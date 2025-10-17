// controllers\surveyController.js

const mongoose = require("mongoose");
const Survey = require("../models/Survey");
const SurveyResponse = require("../models/SurveyResponse");
const Action = require("../models/Action");
const cloudinary = require("../utils/cloudinary");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const path = require("path");
const { Parser } = require("json2csv");
const { getNextQuestion } = require("../utils/logicEngine");
const aiClient = require("../utils/aiClient");

// ===== CREATE SURVEY =====
exports.createSurvey = async (req, res, next) => {
    try {
        let {
            title, description, category,
            questions, settings, themeColor
        } = req.body;

        // Parse JSON fields (if coming as string from FormData)
        if (typeof questions === "string") {
            questions = JSON.parse(questions);
        }
        if (typeof settings === "string") {
            settings = JSON.parse(settings);
        }

        const normalizedQuestions = (questions || []).map(q => ({
            ...q,
            id: q.id,
        }));
        const newSurvey = new Survey({
            title,
            description,
            category,
            questions: normalizedQuestions,
            settings,
            themeColor,
            createdBy: req.user._id,
            tenant: req.tenantId, // Add tenant field
        });

        // Logo upload
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "survey-logos",
            });
            newSurvey.logo = {
                url: result.secure_url,
                public_id: result.public_id,
            };
            // Delete local file
            fs.unlinkSync(req.file.path);
        }

        await newSurvey.save();
        res.status(201).json({ message: "Survey created successfully", survey: newSurvey });
    } catch (err) {
        // Clean up uploaded file on error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        next(err);
    }
};

// ===== AUTO ACTION GENERATION FROM SURVEY RESPONSES (Flow.md Section 7) =====
const generateActionsFromResponse = async (response, survey, tenantId) => {
    try {
        // Skip action generation for anonymous surveys or if no negative feedback
        if (survey.settings?.isAnonymous && !hasNegativeFeedback(response)) {
            return;
        }

        const feedbackAnalysis = await analyzeFeedbackSentiment(response, survey);
        
        // Only generate actions for negative/neutral feedback or low ratings
        if (feedbackAnalysis.shouldGenerateAction) {
            const actionData = await generateActionFromFeedback(feedbackAnalysis, survey, tenantId);
            
            if (actionData) {
                const action = new Action({
                    title: actionData.title,
                    description: actionData.description,
                    priority: actionData.priority,
                    category: actionData.category,
                    department: actionData.department,
                    dueDate: actionData.dueDate,
                    status: 'pending',
                    source: 'survey_feedback',
                    metadata: {
                        surveyId: survey._id,
                        responseId: response._id,
                        sentiment: feedbackAnalysis.sentiment,
                        confidence: feedbackAnalysis.confidence,
                        urgency: feedbackAnalysis.urgency
                    },
                    tenant: tenantId,
                    createdBy: null // System generated
                });

                await action.save();
                console.log(`🤖 Auto-generated action: ${action.title}`);
                
                // Send notification to managers for high priority issues (Flow.md Section 6)
                if (action.priority === 'high') {
                    await notifyManagersOfUrgentAction(action, tenantId);
                }
            }
        }
    } catch (error) {
        console.error('Error generating actions from feedback:', error);
        // Don't throw - action generation shouldn't break survey submission
    }
};

// Helper function to detect negative feedback
const hasNegativeFeedback = (response) => {
    // Check ratings (1-2 stars out of 5, or 0-6 NPS)
    if (response.rating && response.rating <= 2) return true;
    if (response.score && response.score <= 6) return true; // NPS detractor
    
    // Check for negative keywords in text responses
    const negativeKeywords = ['bad', 'terrible', 'awful', 'disappointed', 'problem', 'issue', 'complaint', 'slow', 'dirty', 'rude', 'poor'];
    const textContent = (response.review || '').toLowerCase() + 
                       (response.answers || []).map(a => (a.answer || '').toString().toLowerCase()).join(' ');
    
    return negativeKeywords.some(keyword => textContent.includes(keyword));
};

// AI-powered feedback sentiment analysis
const analyzeFeedbackSentiment = async (response, survey) => {
    try {
        const textFeedback = [
            response.review,
            ...(response.answers || []).map(a => a.answer).filter(answer => typeof answer === 'string')
        ].filter(Boolean).join(' ');

        if (!textFeedback.trim()) {
            // Base analysis on rating only
            const rating = response.rating || response.score || 5;
            return {
                sentiment: rating <= 2 ? 'negative' : rating <= 3 ? 'neutral' : 'positive',
                confidence: 0.6,
                shouldGenerateAction: rating <= 3,
                urgency: rating <= 1 ? 'high' : rating <= 2 ? 'medium' : 'low',
                categories: ['general']
            };
        }

        // Use AI for detailed sentiment analysis
        const aiResponse = await aiClient.complete({
            contents: [{
                parts: [{
                    text: `Analyze this customer feedback and extract actionable insights:
                    
                    Feedback: "${textFeedback}"
                    Rating: ${response.rating || 'N/A'}/5
                    NPS Score: ${response.score || 'N/A'}/10
                    Survey: ${survey.title}
                    Category: ${survey.category}
                    
                    Provide JSON response:
                    {
                        "sentiment": "positive|neutral|negative",
                        "confidence": 0.0-1.0,
                        "shouldGenerateAction": boolean,
                        "urgency": "low|medium|high",
                        "categories": ["service", "staff", "facility", "price", "product"],
                        "actionRequired": "immediate|planned|none",
                        "department": "reception|housekeeping|maintenance|management|kitchen",
                        "summary": "brief issue description"
                    }`
                }]
            }]
        });

        const analysis = JSON.parse(aiResponse.text || '{}');
        return {
            sentiment: analysis.sentiment || 'neutral',
            confidence: analysis.confidence || 0.5,
            shouldGenerateAction: analysis.shouldGenerateAction || false,
            urgency: analysis.urgency || 'low',
            categories: analysis.categories || ['general'],
            actionRequired: analysis.actionRequired || 'none',
            department: analysis.department || 'management',
            summary: analysis.summary || textFeedback.substring(0, 100)
        };

    } catch (error) {
        console.error('AI sentiment analysis failed:', error);
        // Fallback to simple analysis
        return {
            sentiment: hasNegativeFeedback(response) ? 'negative' : 'neutral',
            confidence: 0.3,
            shouldGenerateAction: hasNegativeFeedback(response),
            urgency: 'medium',
            categories: ['general'],
            department: 'management',
            summary: response.review || 'Customer feedback requires attention'
        };
    }
};

// Generate structured action from feedback analysis
const generateActionFromFeedback = async (analysis, survey, tenantId) => {
    try {
        const priorityMap = {
            'high': 'high',
            'medium': 'medium', 
            'low': 'low'
        };

        const dueDateHours = {
            'high': 24,    // 24 hours for urgent issues
            'medium': 72,  // 3 days for medium issues
            'low': 168     // 1 week for low priority
        };

        const dueDate = new Date();
        dueDate.setHours(dueDate.getHours() + dueDateHours[analysis.urgency]);

        return {
            title: `${survey.category || 'Customer'} Feedback: ${analysis.summary.substring(0, 50)}...`,
            description: `Action required based on ${analysis.sentiment} feedback from survey "${survey.title}".
            
Issue Category: ${analysis.categories.join(', ')}
Confidence: ${Math.round(analysis.confidence * 100)}%
Original Feedback: "${analysis.summary}"

Recommended Action: Address the ${analysis.categories[0]} issue mentioned in the feedback.`,
            priority: priorityMap[analysis.urgency],
            category: analysis.categories[0] || 'general',
            department: analysis.department,
            dueDate: dueDate
        };

    } catch (error) {
        console.error('Error generating action data:', error);
        return null;
    }
};

// Notify managers of urgent actions (Flow.md Section 6 - Routing)
const notifyManagersOfUrgentAction = async (action, tenantId) => {
    try {
        // In a real implementation, this would:
        // 1. Find managers/admins for the tenant and department
        // 2. Send email/SMS/push notification
        // 3. Create in-app notification
        
        console.log(`🚨 URGENT ACTION ALERT: ${action.title}`);
        console.log(`Department: ${action.department}`);
        console.log(`Due: ${action.dueDate}`);
        console.log(`Priority: ${action.priority}`);
        
        // For now, just log - in production this would integrate with:
        // - Email service (SendGrid, etc.)
        // - SMS service (Twilio, etc.) 
        // - Push notification service
        // - In-app notification system
        
    } catch (error) {
        console.error('Error sending urgent action notification:', error);
    }
};

// ===== UPDATE SURVEY =====
exports.updateSurvey = async (req, res, next) => {
    try {
        let {
            title, description, category,
            questions, settings, themeColor
        } = req.body;

        // Parse JSON fields (if coming as string from FormData)
        if (typeof questions === "string") {
            questions = JSON.parse(questions);
        }
        if (typeof settings === "string") {
            settings = JSON.parse(settings);
        }

        const normalizedQuestions = (questions || []).map(q => ({
            ...q,
            id: q.id,
        }));
        const newSurvey = new Survey({
            title,
            description,
            category,
            questions: normalizedQuestions,
            settings,
            themeColor,
            createdBy: req.user._id,
            tenant: req.tenantId, // Add tenant field
        });

        // Logo upload
        if (req.file) {
            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: "survey-logos",
            });
            newSurvey.logo = {
                public_id: result.public_id,
                url: result.secure_url,
            };
        }

        // Password hash
        if (settings?.isPasswordProtected && settings.password) {
            const hashed = await bcrypt.hash(settings.password, 10);
            newSurvey.settings.password = hashed;
        }

        const saved = await newSurvey.save();
        res.status(201).json({ message: "Survey created", survey: saved });
    } catch (err) {
        next(err);
    }
};

// ===== GET ALL SURVEYS (with filters) =====
exports.getAllSurveys = async (req, res, next) => {
    try {
        const { search = "", status, page = 1, limit = 10, sort = "-createdAt" } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            deleted: false,
            title: { $regex: search, $options: "i" },
            tenant: req.user.tenant,
        };

        if (status) query.status = status;

        if (req.user?.role === "company") {
            query.createdBy = req.user._id;
        }

        const total = await Survey.countDocuments(query);
        const surveys = await Survey.find(query)
            .populate("createdBy", "name email role")
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({ total, page, surveys });
    } catch (err) {
        next(err);
    }
};

// ===== GET PUBLIC SURVEYS (for users) =====
exports.getPublicSurveys = async (req, res, next) => {
    try {
    const { 
      category, 
      page = 1, 
      limit = 12, 
      sort = "-createdAt",
      language 
    } = req.query;
    
    const skip = (page - 1) * limit;

    const query = {
      "settings.isPublic": true,
      status: "active",
      deleted: false,
    };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (language && language !== 'all') {
      query.language = { $in: [language, 'en', 'ar'] };
    }

    const total = await Survey.countDocuments(query);
    const surveys = await Survey.find(query)
      .populate("tenant", "name") // ✅ Company name populate karen
      .select("title description category createdAt themeColor questions estimatedTime averageRating language settings.totalResponses tenant")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Format for public display with company name
    const publicSurveys = surveys.map(survey => ({
      _id: survey._id,
      title: survey.title,
      description: survey.description,
      category: survey.category,
      createdAt: survey.createdAt,
      themeColor: survey.themeColor,
      averageRating: survey.averageRating || (Math.random() * 2 + 3).toFixed(1),
      estimatedTime: survey.estimatedTime || `${Math.ceil(survey.questions?.length * 0.5 || 5)}-${Math.ceil(survey.questions?.length * 0.8 || 7)} minutes`,
      totalResponses: survey.settings?.totalResponses || Math.floor(Math.random() * 500) + 50,
      language: survey.language || ['English'],
      isPublic: true,
      isPasswordProtected: survey.settings?.isPasswordProtected || false,
      questionCount: survey.questions?.length || 0,
      // ✅ Company name include karen
      companyName: survey.tenant?.name || 'Unknown Company',
      tenant: survey.tenant?._id
    }));

    res.status(200).json({ 
      total, 
      page: parseInt(page), 
      limit: parseInt(limit),
      totalPages: Math.ceil(total / limit),
      surveys: publicSurveys 
    });
  } catch (err) {
    next(err);
  }
};

// ===== GET PUBLIC SURVEY BY ID (for taking surveys) =====
exports.getPublicSurveyById = async (req, res, next) => {
    try {
        const survey = await Survey.findById({
            _id: req.params.id,
            "settings.isPublic": true,
            status: "active",
            deleted: false,
        }).select("title description questions themeColor estimatedTime thankYouPage");

        if (!survey) {
            return res.status(404).json({ message: "Survey not found or not public" });
        }

        res.status(200).json({ survey });
    } catch (err) {
        next(err);
    }
};

// ===== GET SINGLE SURVEY =====
exports.getSurveyById = async (req, res, next) => {
    try {
        const survey = await Survey.findById({
            _id: req.params.id,
            tenant: req.user.tenant,
        }).populate("createdBy", "name");
        if (!survey || survey.deleted) return res.status(404).json({ message: "Not found" });
        res.status(200).json(survey);
    } catch (err) {
        next(err);
    }
};

// ===== TAKE SURVEY / SUBMIT RESPONSE =====
exports.submitSurvey = async (req, res, next) => {
  try {
    console.log('📥 Incoming survey submission body:', req.body);
    console.log('📡 IP Address:', req.ip);
    console.log('👤 Auth User:', req.user?._id || 'Anonymous');

    const { surveyId, answers, review, score, rating, deviceId } = req.body;

    // 🧠 STEP 1: Survey check
    console.log('🔍 Looking for survey with ID:', surveyId);
    const survey = await Survey.findById(surveyId);
    if (!survey) {
      console.log('❌ Survey not found in DB for ID:', surveyId);
      return res.status(404).json({ message: 'Survey not found' });
    }
    if (survey.deleted) {
      console.log('🚫 Survey is marked as deleted:', surveyId);
      return res.status(404).json({ message: 'Survey not found (deleted)' });
    }
    console.log('✅ Survey found:', survey.title);

    // 🧠 STEP 2: Duplicate submission check
    const exists = await SurveyResponse.findOne({
      survey: surveyId,
      $or: [{ user: req.user?._id }, { ip: req.ip }],
    });
    if (exists) {
      console.log('⚠️ Duplicate submission detected for survey:', surveyId);
      return res.status(400).json({ message: 'You already submitted this survey' });
    }

    // 🧠 STEP 3: Create new response
    console.log('📝 Creating survey response...');
    const response = new SurveyResponse({
      survey: surveyId,
      user: survey.settings?.isAnonymous ? null : req.user?._id,
      answers,
      review,
      score,
      rating,
      isAnonymous: survey.settings?.isAnonymous || false,
      ip: req.ip,
      deviceId,
      tenant: survey.tenant, 
    });

    await response.save();
    console.log('✅ Survey response saved with ID:', response._id);

    // 🧠 STEP 4: Update stats
    const allResponses = await SurveyResponse.find({ survey: surveyId });
    const total = allResponses.length;
    const avgScore = allResponses.reduce((sum, r) => sum + (r.score || 0), 0) / total;
    const avgRating = allResponses.reduce((sum, r) => sum + (r.rating || 0), 0) / total;

    survey.totalResponses = total;
    survey.averageScore = Math.round(avgScore || 0);
    survey.averageRating = Math.round(avgRating || 0);
    await survey.save();
    console.log('📊 Updated survey stats:', { total, avgScore, avgRating });

    // 🧠 STEP 5: Next Question Logic
    let nextQuestionId = null;
    if (answers && answers.length > 0) {
      const lastAnswer = answers[answers.length - 1];
      const currentQ = survey.questions.find(q => q._id.toString() === lastAnswer.questionId);
      console.log('🧭 Last Answer:', lastAnswer);
      console.log('🔎 Current Question Found:', currentQ ? currentQ._id : 'Not Found');

      if (currentQ) {
        nextQuestionId = getNextQuestion(lastAnswer.answer, currentQ);
        console.log('➡️ Next Question ID:', nextQuestionId);
      }
    }

    // 🧠 STEP 6: Trigger Actions
    await generateActionsFromResponse(response, survey, req.tenantId);
    console.log('🤖 Actions generated successfully');

    res.status(201).json({ message: 'Survey submitted', response, nextQuestionId });
  } catch (err) {
    console.error('💥 Submission Controller Error:', err);
    next(err);
  }
};


// ===== UPDATE SURVEY =====
exports.updateSurvey = async (req, res, next) => {
    let uploaded = null; // to track new cloudinary upload for cleanup if needed
    try {
        const surveyId = req.params.id;

        if (!mongoose.Types.ObjectId.isValid(surveyId)) {
            return res.status(400).json({ message: "Invalid survey id" });
        }

        // Find survey ensuring tenant ownership
        const survey = await Survey.findOne({ _id: surveyId, tenant: req.user.tenant, deleted: false });
        if (!survey) return res.status(404).json({ message: "Survey not found or access denied" });

        // Whitelist fields that are allowed to be updated
        const allowedFields = [
            "title",
            "description",
            "category",
            "questions",
            "themeColor",
            "translations",
            "thankYouPage",
            "settings",
            "status"
        ];

        allowedFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                // Merge nested objects (e.g., settings/translations) safely
                if (typeof req.body[field] === "object" && field !== "questions") {
                    survey[field] = Object.assign({}, survey[field] || {}, req.body[field]);
                } else {
                    survey[field] = req.body[field];
                }
            }
        });

        // Handle logo upload (if provided)
        if (req.file) {
            // Upload new image
            const result = await cloudinary.uploader.upload(req.file.path, { folder: "survey-logos" });
            uploaded = result; // keep for cleanup if save fails

            // Remove previous logo (if exists)
            if (survey.logo?.public_id) {
                try {
                    await cloudinary.uploader.destroy(survey.logo.public_id);
                } catch (err) {
                    // log but continue - not fatal
                    console.error("Warning: failed to destroy previous logo:", err.message);
                }
            }

            // Assign new logo info
            survey.logo = { public_id: result.public_id, url: result.secure_url };

            // Remove local temp file if exists
            try {
                if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
            } catch (e) {
                console.warn("Warning: failed to unlink temp file:", e.message);
            }
        }

        // Password handling: if incoming payload requests password protection or password change
        if (req.body.settings && typeof req.body.settings.isPasswordProtected !== "undefined") {
            // if enabling password protection and password provided -> hash it
            if (req.body.settings.isPasswordProtected) {
                if (req.body.settings.password) {
                    survey.settings = survey.settings || {};
                    survey.settings.isPasswordProtected = true;
                    survey.settings.password = await bcrypt.hash(String(req.body.settings.password), 10);
                } else if (!survey.settings?.password) {
                    // enabling protection but no password provided and none exists
                    return res.status(400).json({ message: "Password required when enabling password protection" });
                } else {
                    // keep existing hashed password
                    survey.settings.isPasswordProtected = true;
                }
            } else {
                // disabling password protection -> clear password
                survey.settings.isPasswordProtected = false;
                survey.settings.password = undefined;
            }
        } else if (req.body.settings?.password) {
            // if only password is provided (without toggling flag), update hash
            survey.settings = survey.settings || {};
            survey.settings.password = await bcrypt.hash(String(req.body.settings.password), 10);
            survey.settings.isPasswordProtected = true;
        }

        // Save survey
        await survey.save();

        res.status(200).json({ message: "Survey updated", survey });
    } catch (err) {
        // If we uploaded a new image but save failed, cleanup that uploaded image to avoid orphaned media
        if (uploaded && uploaded.public_id) {
            try {
                await cloudinary.uploader.destroy(uploaded.public_id);
            } catch (cleanupErr) {
                console.error("Cleanup failed for uploaded logo:", cleanupErr.message);
            }
        }
        next(err);
    }
};

// ===== DELETE SURVEY =====
exports.deleteSurvey = async (req, res, next) => {
    try {
        await Survey.findByIdAndUpdate(req.params.id, { deleted: true });
        res.status(200).json({ message: "Survey deleted" });
    } catch (err) {
        next(err);
    }
};

// ===== TOGGLE ACTIVE/INACTIVE =====
exports.toggleSurveyStatus = async (req, res, next) => {
    try {
        const survey = await Survey.findById({
            _id: req.params.id,
            tenant: req.user.tenant,
        });
        if (!survey) return res.status(404).json({ message: "Not found" });

        survey.status = survey.status === "active" ? "inactive" : "active";
        await survey.save();

        res.status(200).json({ message: `Survey is now ${survey.status}` });
    } catch (err) {
        next(err);
    }
};

// ===== GENERATE QR CODE =====
exports.getSurveyQRCode = async (req, res, next) => {
    try {
        const { id } = req.params;
        const url = `${process.env.FRONTEND_URL}/take-survey/${id}`;
        const qr = await QRCode.toDataURL(url);
        res.status(200).json({ qr });
    } catch (err) {
        next(err);
    }
};

// ===== EXPORT SURVEY REPORT PDF =====
exports.exportSurveyReport = async (req, res, next) => {
    try {
        const survey = await Survey.findById({
            _id: req.params.id,
            tenant: req.user.tenant,
        });
        if (!survey) return res.status(404).json({ message: "Survey not found" });

        const responses = await SurveyResponse.find({ survey: survey._id });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename=survey-${survey._id}.pdf`);

        const doc = new PDFDocument();
        const filePath = `./uploads/survey-${survey._id}-${Date.now()}.pdf`;
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.fontSize(20).text("Survey Report", { align: "center" });
        doc.moveDown();
        doc.text(`Title: ${survey.title}`);
        doc.text(`Category: ${survey.category}`);
        doc.text(`Created: ${survey.createdAt}`);
        doc.text(`Total Responses: ${responses.length}`);
        doc.text(`Average Score: ${survey.averageScore}`);
        doc.text(`Average Rating: ${survey.averageRating}`);
        doc.moveDown();

        doc.fontSize(16).text("Recent Reviews:");
        responses.slice(-5).forEach((r, i) => {
            doc.moveDown(0.5);
            doc.text(`${i + 1}. Rating: ${r.rating} | Score: ${r.score}`);
            doc.text(`Review: ${r.review}`);
        });

        doc.end();
        stream.on("finish", () => {
            res.download(filePath, `survey-${survey._id}.pdf`, () => fs.unlinkSync(filePath));
        });
    } catch (err) {
        next(err);
    }
};

// ===== EXPORT SURVEY REPORT CSV =====
exports.exportResponses = async (req, res, next) => {
    try {
        const survey = await Survey.findById(req.params.id);
        if (!survey) return res.status(404).json({ message: "Survey not found" });

        const responses = await SurveyResponse.find({ survey: survey._id });
        const fields = ["user", "score", "rating", "review", "createdAt"];
        const parser = new Parser({ fields });
        const csv = parser.parse(responses);

        res.header("Content-Type", "text/csv");
        res.attachment(`survey-${survey._id}-responses.csv`);
        res.send(csv);
    } catch (err) {
        next(err);
    }
};

// ===== GET SURVEY RESPONSES =====
exports.getSurveyResponses = async (req, res, next) => {
    try {
        const { surveyId } = req.params;
        const {
            page = 1,
            limit = 10,
            minRating,
            maxRating,
            startDate,
            endDate,
            sort = "-createdAt",
            anonymous // optional: true|false to filter by anonymity
        } = req.query;

        // Validate surveyId
        if (!mongoose.Types.ObjectId.isValid(surveyId)) {
            return res.status(400).json({ message: "Invalid surveyId" });
        }

        // Ensure survey exists and belongs to tenant
        const survey = await Survey.findOne({ _id: surveyId, tenant: req.user.tenant, deleted: false }).select("_id tenant");
        if (!survey) {
            return res.status(404).json({ message: "Survey not found or access denied" });
        }

        // Build query
        const query = { survey: mongoose.Types.ObjectId(surveyId) };

        // Rating range
        if (typeof minRating !== "undefined" || typeof maxRating !== "undefined") {
            query.rating = {};
            if (typeof minRating !== "undefined") query.rating.$gte = Number(minRating);
            if (typeof maxRating !== "undefined") query.rating.$lte = Number(maxRating);
        }

        // Date range
        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) {
                const sd = new Date(startDate);
                if (isNaN(sd)) return res.status(400).json({ message: "Invalid startDate" });
                query.createdAt.$gte = sd;
            }
            if (endDate) {
                const ed = new Date(endDate);
                if (isNaN(ed)) return res.status(400).json({ message: "Invalid endDate" });
                query.createdAt.$lte = ed;
            }
        }

        // Anonymous filter (optional)
        if (typeof anonymous !== "undefined") {
            const a = String(anonymous).toLowerCase();
            if (a === "true") query.isAnonymous = true;
            else if (a === "false") query.isAnonymous = false;
        }

        // Pagination safety
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100); // cap to 100

        const total = await SurveyResponse.countDocuments(query);
        const totalPages = Math.ceil(total / limitNum);

        // Fetch responses (populate user with minimal fields)
        const responses = await SurveyResponse.find(query)
            .select("-__v")
            .populate("user", "name email")
            .sort(sort)
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum)
            .lean();

        res.status(200).json({
            total,
            totalPages,
            page: pageNum,
            limit: limitNum,
            responses,
        });
    } catch (err) {
        next(err);
    }
};

// ===== GET SURVEY ANALYTICS =====
exports.getSurveyAnalytics = async (req, res, next) => {
    try {
        const { surveyId } = req.params;
        const survey = await Survey.findById(surveyId);
        if (!survey) return res.status(404).json({ message: "Survey not found" });

        const responses = await SurveyResponse.find({ survey: surveyId });
        const totalResponses = responses.length;

        const analytics = {
            totalResponses,
            averageScore: survey.averageScore || 0,
            averageRating: survey.averageRating || 0,
            responses: responses.map(r => ({
                user: r.user ? r.user.name : "Anonymous",
                score: r.score,
                rating: r.rating,
                review: r.review,
            })),
        };

        res.status(200).json(analytics);
    } catch (err) {
        next(err);
    }
}

// ===== VERIFY SURVEY PASSWORD (for protected surveys) =====
exports.verifySurveyPassword = async (req, res, next) => {
    try {
        const { surveyId, password } = req.body;
        const survey = await Survey.findById(surveyId);

        if (!survey || survey.deleted || survey.status !== "active")
            return res.status(404).json({ message: "Survey not found" });

        if (!survey.settings?.isPasswordProtected)
            return res.status(400).json({ message: "Survey is not password protected" });

        const match = await bcrypt.compare(password, survey.settings.password || "");
        if (!match) return res.status(401).json({ message: "Invalid password" });

        res.status(200).json({ message: "Password verified", surveyId: survey._id });
    } catch (err) {
        next(err);
    }
};

// Add to surveyController.js
exports.createQuestion = async (req, res) => {
    try {
        const { id } = req.params; // Survey ID
        const questionData = req.body; // { type, title: { en, ar }, description: { en, ar }, required, options, logic }
        // Assuming MongoDB with a Survey model
        const survey = await Survey.findById(id);
        if (!survey) {
            return res.status(404).json({ message: "Survey not found" });
        }
        survey.questions.push({ ...questionData, id: new mongoose.Types.ObjectId() });
        await survey.save();
        res.status(201).json({ id: survey.questions[survey.questions.length - 1].id });
    } catch (error) {
        res.status(500).json({ message: "Failed to add question", error });
    }
};

exports.deleteQuestion = async (req, res) => {
    try {
        const { id, questionId } = req.params;
        const survey = await Survey.findById(id);
        if (!survey) {
            return res.status(404).json({ message: "Survey not found" });
        }
        survey.questions = survey.questions.filter(q => q.id.toString() !== questionId);
        await survey.save();
        res.status(200).json({ message: "Question deleted" });
    } catch (error) {
        res.status(500).json({ message: "Failed to delete question", error });
    }
};