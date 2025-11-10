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
const { analyzeFeedbackLogic } = require("./feedbackController")
const { sendSurveyWhatsApp } = require('./distributionController');
const Logger = require("../utils/auditLog");
const Joi = require("joi");

const createSchema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string().optional(),
    category: Joi.string().optional(),
    questions: Joi.array().min(1).required(),
    settings: Joi.object().optional(),
    themeColor: Joi.string().optional(),
    status: Joi.string().valid("draft", "active").default("draft"),
    targetAudience: Joi.object({
        type: Joi.string().valid("all", "specific").optional(),
        emails: Joi.array().items(Joi.string().email()).optional(),
        phones: Joi.array().items(Joi.string().pattern(/^\+\d{10,15}$/)).optional(),
        userIds: Joi.array().items(Joi.string().hex().length(24)).optional(),
    }).optional(),
    schedule: Joi.object({
        startDate: Joi.date().optional(),
        endDate: Joi.date().optional(),
        timezone: Joi.string().optional().default("Asia/Karachi"),
        autoPublish: Joi.boolean().optional().default(true),
        repeat: Joi.object().optional(),
    }).optional(),
});

// ===== CREATE SURVEY =====
// exports.createSurvey = async (req, res, next) => {
//     try {
//         let { title, description, category, questions, settings, themeColor, status } = req.body;

//         // parse possible JSON strings
//         if (typeof questions === "string") questions = JSON.parse(questions);
//         if (typeof settings === "string") settings = JSON.parse(settings);

//         // normalize question IDs
//         const normalizedQuestions = (questions || []).map((q) => ({
//             ...q,
//             id: q.id,
//         }));

//         const newSurvey = new Survey({
//             title,
//             description,
//             category,
//             questions: normalizedQuestions,
//             status: status || "active",
//             settings,
//             themeColor,
//             createdBy: req.user._id,
//             tenant: req.tenantId,
//         });

//         // --- logo upload if available ---
//         if (req.file) {
//             try {
//                 const result = await cloudinary.uploader.upload(req.file.path, {
//                     folder: "survey-logos",
//                 });
//                 newSurvey.logo = {
//                     url: result.secure_url,
//                     public_id: result.public_id,
//                 };
//                 fs.unlinkSync(req.file.path);
//                 await Logger.info("createSurvey: Logo uploaded", {
//                     fileName: req.file.filename,
//                     cloudPublicId: result.public_id,
//                 });
//             } catch (uploadErr) {
//                 await Logger.error("createSurvey: Logo upload failed", {
//                     error: uploadErr.message,
//                 });
//                 if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//                 return res.status(500).json({ message: "Failed to upload logo" });
//             }
//         }

//         // --- hash password if survey is password-protected ---
//         if (settings?.isPasswordProtected && settings.password) {
//             newSurvey.settings.password = await bcrypt.hash(
//                 String(settings.password),
//                 10
//             );
//         }

//         const savedSurvey = await newSurvey.save();

//         await Logger.info("createSurvey: Survey created successfully", {
//             surveyId: savedSurvey._id,
//             createdBy: req.user._id,
//             tenantId: req.tenantId,
//         });

//         res
//             .status(201)
//             .json({ message: "Survey created successfully", survey: savedSurvey });
//     } catch (err) {
//         if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
//         await Logger.error("createSurvey: Error", {
//             error: err.message,
//             stack: err.stack,
//             userId: req.user?._id,
//             tenantId: req.tenantId,
//         });
//         next(err);
//     }
// };
// exports.createSurvey = async (req, res, next) => {
//     try {
//         const { error, value } = createSchema.validate(req.body);
//         if (error) {
//             if (req.file) fs.unlinkSync(req.file.path);
//             return res.status(400).json({ message: error.details[0].message });
//         }

//         const {
//             title, description, category, questions, settings, themeColor,
//             status, targetAudience, schedule
//         } = value;

//         const normalizedQuestions = questions.map(q => ({ ...q, id: q.id || String(new mongoose.Types.ObjectId()) }));

//         const newSurvey = new Survey({
//             title, description, category, questions: normalizedQuestions,
//             settings, themeColor,
//             createdBy: req.user._id,
//             tenant: req.tenantId,
//             status: "draft", // hamesha draft se start
//             targetAudience: targetAudience || null,
//             schedule: schedule || null,
//         });

//         // Logo upload (tumhara purana code yahan paste kar do)
//         if (req.file) {
//             const result = await cloudinary.uploader.upload(req.file.path, { folder: "survey_logos" });
//             newSurvey.logo = { public_id: result.public_id, url: result.secure_url };
//             fs.unlinkSync(req.file.path);
//         }

//         // Password hash (agar protected)
//         if (settings?.isPasswordProtected && settings?.password) {
//             newSurvey.settings.password = await bcrypt.hash(settings.password, 10);
//         }

//         // Agar direct publish karna hai
//         if (status === "active") {
//             if (!targetAudience || !schedule) {
//                 return res.status(400).json({ message: "Target audience aur schedule zaroori hain publish ke liye" });
//             }

//             newSurvey.targetAudience = targetAudience;
//             newSurvey.schedule = schedule;

//             const now = new Date();
//             if (new Date(schedule.startDate) <= now && schedule.autoPublish) {
//                 newSurvey.status = "active";
//                 newSurvey.schedule.publishedAt = now;
//                 newSurvey.publishLog.push({
//                     publishedBy: req.user._id,
//                     method: "manual",
//                     recipientsCount: (targetAudience.phones?.length || 0) + (targetAudience.emails?.length || 0)
//                 });

//                 // Immediate distribution
//                 const recipients = [...(targetAudience.phones || []), ...(targetAudience.emails || [])];
//                 if (recipients.length > 0) {
//                     const mockReq = {
//                         body: { surveyId: newSurvey._id, recipients },
//                         tenantId: req.tenantId
//                     };
//                     await require('./distributionController').sendSurveyWhatsApp(mockReq, res, next);
//                 }
//             } else {
//                 newSurvey.status = "scheduled";
//             }
//         }

//         const savedSurvey = await newSurvey.save();
//         await Logger.info("Survey created", { surveyId: savedSurvey._id, status: savedSurvey.status });
//         res.status(201).json({
//             message: status === "active" ? "Survey published!" : "Draft saved!",
//             survey: savedSurvey
//         });

//     } catch (err) {
//         await Logger.error("createSurvey error", { error: err.message });
//         next(err);
//     }
// };

exports.createSurvey = async (req, res) => {
    try {
        const { targetAudience, publishSettings, questions, ...surveyData } = req.body;

        // STEP 1: Save survey as draft first
        const newSurvey = new Survey({
            ...surveyData,
            questions,
            createdBy: req.user._id,
            tenant: req.tenantId,
            status: "draft",
            targetAudience: null,
            schedule: null
        });

        // STEP 2: Agar publishNow = true → turant active karo
        if (publishSettings?.publishNow) {
            newSurvey.status = "active";
            newSurvey.schedule = {
                startDate: new Date(),
                publishedAt: new Date(),
                autoPublish: true
            };

            // STEP 3: Audience ke hisaab se recipients banayein
            let recipients = [];

            if (targetAudience?.includes("customers")) {
                const customers = await User.find({ role: "customer", tenant: req.tenantId });
                recipients = customers.map(c => c.phone || c.email);
            }

            if (targetAudience?.includes("employees")) {
                const employees = await User.find({ role: "employee", tenant: req.tenantId });
                recipients.push(...employees.map(e => e.phone));
            }

            recipients = [...new Set(recipients)]; // Remove duplicates

            newSurvey.targetAudience = {
                phones: recipients.filter(r => r.startsWith("+")),
                emails: recipients.filter(r => r.includes("@")),
            };

            newSurvey.publishLog.push({
                publishedBy: req.user._id,
                method: "manual",
                recipientsCount: recipients.length,
            });

            // STEP 4: Send via WhatsApp/SMS
            if (recipients.length > 0) {
                const mockReq = {
                    body: { surveyId: newSurvey._id, recipients },
                    tenantId: req.tenantId,
                };
                await sendSurveyWhatsApp(mockReq, res, () => { });
            }
        }

        // STEP 5: Schedule publish if specified
        else if (publishSettings?.scheduleDate && publishSettings?.scheduleTime) {
            const startDate = new Date(`${publishSettings.scheduleDate}T${publishSettings.scheduleTime}:00`);
            newSurvey.status = "scheduled";
            newSurvey.schedule = {
                startDate,
                autoPublish: true,
                timezone: "Asia/Karachi",
            };
        }

        await newSurvey.save();
        res.json({ survey: newSurvey, message: "Survey created successfully!" });

    } catch (err) {
        console.error("❌ createSurvey error:", err);
        res.status(500).json({ message: "Server error during survey creation", error: err.message });
    }
};

exports.publishSurvey = async (req, res, next) => {
    try {
        const { surveyId } = req.params;
        const survey = await Survey.findOne({ _id: surveyId, tenant: req.tenantId, deleted: false });

        if (!survey) return res.status(404).json({ message: "Survey nahi mila" });
        if (survey.status !== "draft") return res.status(400).json({ message: "Sirf draft publish ho sakta hai" });
        if (!survey.targetAudience || !survey.schedule) {
            return res.status(400).json({ message: "Pehle audience aur schedule set karo" });
        }

        const now = new Date();
        if (new Date(survey.schedule.startDate) <= now && survey.schedule.autoPublish) {
            survey.status = "active";
            survey.schedule.publishedAt = now;
            survey.publishLog.push({
                publishedBy: req.user._id,
                method: "manual",
                recipientsCount: (survey.targetAudience.phones?.length || 0) + (survey.targetAudience.emails?.length || 0)
            });

            const recipients = [...(survey.targetAudience.phones || []), ...(survey.targetAudience.emails || [])];
            if (recipients.length > 0) {
                const mockReq = { body: { surveyId: survey._id, recipients }, tenantId: req.tenantId };
                await require('./distributionController').sendSurveyWhatsApp(mockReq, res, next);
            }

            await survey.save();
            res.json({ message: "Survey abhi bheja gaya!", survey });
        } else {
            survey.status = "scheduled";
            await survey.save();
            res.json({ message: "Survey schedule ho gaya – time pe bhejega", survey });
        }
    } catch (err) {
        next(err);
    }
};

// ===== AUTO ACTION GENERATION FROM SURVEY RESPONSES (Flow.md Section 7) =====
const generateActionsFromResponse = async (response, survey, tenantId) => {
    try {
        const feedbackText = response.review || response.answers.map(a => a.answer).join(" ");
        if (!feedbackText.trim()) return;

        await Logger.info("🤖 Generating action for feedback", { feedbackPreview: feedbackText.substring(0, 100), responseId: response._id, surveyId: survey._id });

        // AI Call
        const prompt = `Analyze this feedback and suggest one high-priority action: "${feedbackText}"`;
        const aiResult = await aiClient.complete({ prompt, maxTokens: 300 });

        let description = "Review customer feedback";
        let priority = "medium";

        // Clean AI response
        let cleaned = (aiResult.text || "")
            .replace(/```json\n?/g, '')
            .replace(/\n?```/g, '')
            .trim();

        try {
            const parsed = JSON.parse(cleaned);
            description = parsed.description || parsed.summary || description;
            priority = parsed.priority || priority;
        } catch {
            // Fallback
            description = `Auto: Address "${feedbackText.substring(0, 80)}..."`;
            priority = "high";
            await Logger.warn("⚠️ Failed to parse AI response, using fallback", { responseId: response._id, surveyId: survey._id });
        }

        // Create Action
        const action = await Action.create({
            title: "Customer Feedback Review",
            description,
            priority,
            team: "Customer Service",
            category: "Customer Issue",
            tenant: tenantId,
            tags: ["auto-generated", "survey"],
            metadata: { responseId: response._id, surveyId: survey._id }
        });

        await Logger.info("✅ Auto-generated action created", { actionId: action._id, responseId: response._id, surveyId: survey._id });

        // Optional: Follow-up
        await followUp({
            actionIds: [action._id],
            messageTemplate: "Your feedback is being addressed!"
        });
        await Logger.info("💬 Follow-up triggered for action", { actionId: action._id });

    } catch (error) {
        await Logger.error("💥 Error in generateActionsFromResponse", { error: error.message, stack: error.stack, responseId: response._id, surveyId: survey._id });
        console.error("Error in generateActionsFromResponse:", error.message);
        // Don't break submission
    }
};

// Helper function to detect negative feedback
const hasNegativeFeedback = (response) => {
    const lowStarRating = response.rating && response.rating <= 2;
    const npsDetractor = response.score && response.score <= 6;
    if (lowStarRating || npsDetractor) return true;

    const textContent = [response.review, ...(response.answers || []).map(a => a.answer)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (!textContent) return false;

    const negativeKeywords = ['bad', 'terrible', 'awful', 'disappointed', 'problem', 'issue', 'complaint', 'slow', 'dirty', 'rude', 'poor', 'worst', 'hate', 'angry'];
    const positiveNegationPatterns = [/not\s+(bad|terrible|awful|poor)/g];

    const cleanedText = positiveNegationPatterns.reduce((text, pattern) => text.replace(pattern, ""), textContent);

    return negativeKeywords.some(keyword => cleanedText.includes(keyword));
};

// AI-powered feedback sentiment analysis
const analyzeFeedbackSentiment = async (response, survey) => {
    try {
        const textFeedback = [
            response.review,
            ...(response.answers || []).map(a => a.answer).filter(answer => typeof answer === 'string')
        ].filter(Boolean).join(' ');

        await Logger.info("📝 Starting sentiment analysis", { responseId: response._id, surveyId: survey._id, feedbackPreview: textFeedback.substring(0, 100) });

        if (!textFeedback.trim()) {
            const rating = response.rating || response.score || 5;
            const fallbackAnalysis = {
                sentiment: rating <= 2 ? 'negative' : rating <= 3 ? 'neutral' : 'positive',
                confidence: 0.6,
                shouldGenerateAction: rating <= 3,
                urgency: rating <= 1 ? 'high' : rating <= 2 ? 'medium' : 'low',
                categories: ['general']
            };
            await Logger.info("⚠️ No textual feedback, using rating-based analysis", { responseId: response._id, fallbackAnalysis });
            return fallbackAnalysis;
        }

        // AI detailed sentiment analysis
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

        let analysis = {};
        try {
            analysis = JSON.parse(aiResponse.text || '{}');
            await Logger.info("✅ AI sentiment analysis success", { responseId: response._id, analysis });
        } catch (parseError) {
            await Logger.warn("⚠️ Failed to parse AI response, using fallback", { responseId: response._id, rawAIText: aiResponse.text });
        }

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
        await Logger.error("💥 AI sentiment analysis failed, fallback used", { error: error.message, stack: error.stack, responseId: response._id, surveyId: survey._id });
        console.error('AI sentiment analysis failed:', error);
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

// Notify managers of urgent actions (Flow.md Section 6 - Routing)
const notifyManagersOfUrgentAction = async (action, tenantId) => {
    try {
        // Logging for tracking urgent action
        await Logger.info("🚨 URGENT ACTION ALERT", {
            actionId: action._id,
            title: action.title,
            department: action.department,
            dueDate: action.dueDate,
            priority: action.priority,
            tenantId
        });

        console.log(`🚨 URGENT ACTION ALERT: ${action.title}`);
        console.log(`Department: ${action.department}`);
        console.log(`Due: ${action.dueDate}`);
        console.log(`Priority: ${action.priority}`);

        // Placeholder for real notification integrations
        // Email, SMS, Push, In-app notifications

    } catch (error) {
        await Logger.error("Error sending urgent action notification", {
            error: error.message,
            stack: error.stack,
            actionId: action._id,
            tenantId
        });
        console.error('Error sending urgent action notification:', error);
    }
};

// ===== GET ALL SURVEYS (with filters) =====
exports.getAllSurveys = async (req, res, next) => {
    try {
        await Logger.info("getAllSurveys: Request received", {
            userId: req.user?._id,
            role: req.user?.role,
            tenantId: req.user?.tenant,
            queryParams: req.query,
        });

        const { search = "", status, page = 1, limit = 10, sort = "-createdAt" } = req.query;
        const skip = (page - 1) * limit;

        const query = {
            deleted: false,
            title: { $regex: search, $options: "i" },
        };

        // role-based tenant logic
        if (req.user?.role === "admin") {
            await Logger.info("getAllSurveys: Admin access");
        } else if (req.user?.tenant) {
            query.tenant = req.user.tenant;
        } else {
            await Logger.warn("getAllSurveys: Access denied — no tenant", {
                userId: req.user?._id,
            });
            return res.status(403).json({ message: "Access denied: No tenant associated with this user" });
        }

        if (status) query.status = status;
        if (req.user?.role === "companyAdmin") query.createdBy = req.user._id;

        await Logger.info("getAllSurveys: Executing query", { query, skip, limit, sort });

        const total = await Survey.countDocuments(query);
        const surveys = await Survey.find(query)
            .populate("createdBy", "name email role")
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        await Logger.info("getAllSurveys: Query successful", {
            totalResults: surveys.length,
            totalCount: total,
            page,
        });

        res.status(200).json({ total, page, surveys });
    } catch (err) {
        await Logger.error("getAllSurveys: Error occurred", {
            error: err.message,
            stack: err.stack,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
        });
        next(err);
    }
};

// ===== GET PUBLIC SURVEY BY ID (for taking surveys) =====
exports.getPublicSurveys = async (req, res, next) => {
    try {
        await Logger.info("getPublicSurveys: Request received", {
            queryParams: req.query,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
        });

        const {
            category,
            page = 1,
            limit = 12,
            sort = "-createdAt",
            language,
        } = req.query;

        const skip = (page - 1) * limit;

        const query = {
            "settings.isPublic": true,
            status: "active",
            deleted: false,
        };

        if (category && category !== "all") {
            query.category = category;
        }

        if (language && language !== "all") {
            query.language = { $in: [language, "en", "ar"] };
        }

        await Logger.info("getPublicSurveys: Executing query", { query, sort, skip, limit });

        const total = await Survey.countDocuments(query);
        const surveys = await Survey.find(query)
            .populate("tenant", "name")
            .select(
                "title description category createdAt themeColor questions estimatedTime averageRating language settings.totalResponses tenant"
            )
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        await Logger.info("getPublicSurveys: Surveys fetched", {
            totalResults: surveys.length,
            totalCount: total,
        });

        const publicSurveys = surveys.map((survey) => ({
            _id: survey._id,
            title: survey.title,
            description: survey.description,
            category: survey.category,
            createdAt: survey.createdAt,
            themeColor: survey.themeColor,
            averageRating:
                survey.averageRating || (Math.random() * 2 + 3).toFixed(1),
            estimatedTime:
                survey.estimatedTime ||
                `${Math.ceil(survey.questions?.length * 0.5 || 5)}-${Math.ceil(
                    survey.questions?.length * 0.8 || 7
                )} minutes`,
            totalResponses:
                survey.settings?.totalResponses ||
                Math.floor(Math.random() * 500) + 50,
            language: survey.language || ["English"],
            isPublic: true,
            isPasswordProtected: survey.settings?.isPasswordProtected || false,
            questionCount: survey.questions?.length || 0,
            companyName: survey.tenant?.name || "Unknown Company",
            tenant: survey.tenant?._id,
        }));

        await Logger.info("getPublicSurveys: Response ready", {
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        });

        res.status(200).json({
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(total / limit),
            surveys: publicSurveys,
        });
    } catch (err) {
        await Logger.error("getPublicSurveys: Error occurred", {
            error: err.message,
            stack: err.stack,
            queryParams: req.query,
        });
        next(err);
    }
};

// ===== GET SINGLE SURVEY =====
exports.getPublicSurveyById = async (req, res, next) => {
    try {
        await Logger.info("getPublicSurveyById: Request received", {
            surveyId: req.params.id,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
        });

        const survey = await Survey.findOne({
            _id: req.params.id,
            "settings.isPublic": true,
            status: "active",
            deleted: false,
        }).select("title description questions themeColor estimatedTime thankYouPage");

        if (!survey) {
            await Logger.warn("getPublicSurveyById: Survey not found or not public", {
                surveyId: req.params.id,
            });
            return res
                .status(404)
                .json({ message: "Survey not found or not public" });
        }

        await Logger.info("getPublicSurveyById: Survey retrieved successfully", {
            surveyId: survey._id,
            questionCount: survey.questions?.length || 0,
        });

        res.status(200).json({ survey });
    } catch (err) {
        await Logger.error("getPublicSurveyById: Error occurred", {
            error: err.message,
            stack: err.stack,
            surveyId: req.params.id,
        });
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

        if (!survey || survey.deleted) {
            await Logger.warn('getSurveyById: Survey not found or deleted', { surveyId: req.params.id, tenantId: req.user.tenant });
            return res.status(404).json({ message: "Not found" });
        }

        await Logger.info('getSurveyById: Survey fetched successfully', { surveyId: survey._id, tenantId: req.user.tenant });

        res.status(200).json(survey);
    } catch (err) {
        await Logger.error('getSurveyById: Server error', { message: err.message, stack: err.stack, surveyId: req.params.id, tenantId: req.user.tenant });
        next(err);
    }
};

// ===== TAKE SURVEY / SUBMIT RESPONSE =====
exports.submitSurveyResponse = async (req, res, next) => {
    try {
        await Logger.info("submitSurveyResponse: Request received", {
            surveyId: req.body?.surveyId,
            ip: req.ip,
            userId: req.user?._id || "Anonymous",
            deviceId: req.body?.deviceId,
        });

        const { surveyId, answers, responses, review, score, rating, deviceId } = req.body;
        const finalAnswers = answers || responses;

        // 🟢 STEP 1: Survey check
        const survey = await Survey.findById(surveyId);
        if (!survey) {
            await Logger.warn("submitSurveyResponse: Survey not found", { surveyId });
            return res.status(404).json({ message: "Survey not found" });
        }
        if (survey.deleted) {
            await Logger.warn("submitSurveyResponse: Survey marked as deleted", { surveyId });
            return res.status(404).json({ message: "Survey not found (deleted)" });
        }

        await Logger.info("submitSurveyResponse: Survey found", {
            surveyId,
            title: survey.title,
            tenant: survey.tenant,
        });

        // 🟢 STEP 2: Duplicate check
        const exists = await SurveyResponse.findOne({
            survey: surveyId,
            $or: [{ user: req.user?._id }, { ip: req.ip }],
        });

        if (exists) {
            await Logger.warn("submitSurveyResponse: Duplicate submission detected", {
                surveyId,
                ip: req.ip,
                userId: req.user?._id,
            });
            return res.status(400).json({ message: "You already submitted this survey" });
        }

        // 🟢 STEP 3: Create response
        const response = new SurveyResponse({
            survey: surveyId,
            user: survey.settings?.isAnonymous ? null : req.user?._id,
            answers: finalAnswers,
            review,
            score,
            rating,
            isAnonymous: survey.settings?.isAnonymous || false,
            ip: req.ip,
            deviceId,
            tenant: survey.tenant,
        });
        await response.save();

        await Logger.info("submitSurveyResponse: Response saved", {
            responseId: response._id,
            surveyId,
            score,
            rating,
        });

        // 🟢 STEP 4: Update stats
        const allResponses = await SurveyResponse.find({ survey: surveyId });
        const total = allResponses.length;
        const avgScore = allResponses.reduce((sum, r) => sum + (r.score || 0), 0) / total;
        const avgRating = allResponses.reduce((sum, r) => sum + (r.rating || 0), 0) / total;

        survey.totalResponses = total;
        survey.averageScore = Math.round(avgScore || 0);
        survey.averageRating = Math.round(avgRating || 0);
        await survey.save();

        await Logger.info("submitSurveyResponse: Stats updated", {
            surveyId,
            totalResponses: total,
            avgScore,
            avgRating,
        });

        const tenantId = req.tenantId || req.user?.tenant || survey.tenant;
        if (!tenantId) {
            await Logger.error("submitSurveyResponse: No tenant ID found", {
                userId: req.user?._id,
                surveyId,
            });
            return res.status(400).json({ message: "Tenant not configured" });
        }

        // 🟢 STEP 5: Analyze feedback
        await Logger.info("submitSurveyResponse: Analyzing feedback", { surveyId, tenantId });
        await analyzeFeedbackLogic({ responseIds: [response._id] }, tenantId);
        await Logger.info("submitSurveyResponse: Feedback analysis complete", { surveyId });

        // 🟢 STEP 6: Next question logic
        let nextQuestionId = null;
        if (finalAnswers?.length > 0) {
            const lastAnswer = finalAnswers[finalAnswers.length - 1];
            const currentQ = survey.questions.find((q) => q._id.toString() === lastAnswer.questionId);
            if (currentQ) nextQuestionId = getNextQuestion(lastAnswer.answer, currentQ);
        }

        await Logger.info("submitSurveyResponse: Next question determined", {
            nextQuestionId,
        });

        // 🟢 STEP 7: Trigger actions
        await Logger.info("submitSurveyResponse: Generating actions from response", { responseId: response._id });
        await generateActionsFromResponse(response, survey, tenantId);
        await Logger.info("submitSurveyResponse: Actions generated successfully", { responseId: response._id });

        res.status(201).json({ message: "Survey submitted", response, nextQuestionId });

        await Logger.info("submitSurveyResponse: Completed successfully", {
            surveyId,
            responseId: response._id,
            tenantId,
        });
    } catch (err) {
        await Logger.error("submitSurveyResponse: Error occurred", {
            error: err.message,
            stack: err.stack,
            surveyId: req.body?.surveyId,
            userId: req.user?._id || "Anonymous",
        });
        next(err);
    }
};

// ===== UPDATE SURVEY =====
exports.updateSurvey = async (req, res, next) => {
    let uploaded = null;
    try {
        const surveyId = req.params.id;

        await Logger.info("updateSurvey: Incoming request", {
            surveyId,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
            hasFile: !!req.file,
        });

        if (!mongoose.Types.ObjectId.isValid(surveyId)) {
            await Logger.warn("updateSurvey: Invalid survey ID", { surveyId });
            return res.status(400).json({ message: "Invalid survey id" });
        }

        // Find survey ensuring tenant ownership
        const survey = await Survey.findOne({
            _id: surveyId,
            tenant: req.user.tenant,
            deleted: false,
        });

        if (!survey) {
            await Logger.warn("updateSurvey: Survey not found or forbidden", {
                surveyId,
                tenantId: req.user.tenant,
            });
            return res
                .status(404)
                .json({ message: "Survey not found or access denied" });
        }

        const allowedFields = [
            "title",
            "description",
            "category",
            "questions",
            "themeColor",
            "translations",
            "thankYouPage",
            "settings",
            "status",
        ];

        allowedFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                if (typeof req.body[field] === "object" && field !== "questions") {
                    survey[field] = Object.assign({}, survey[field] || {}, req.body[field]);
                } else {
                    survey[field] = req.body[field];
                }
            }
        });

        // 🔹 Logo Upload Handling
        if (req.file) {
            try {
                const result = await cloudinary.uploader.upload(req.file.path, {
                    folder: "survey-logos",
                });
                uploaded = result;

                if (survey.logo?.public_id) {
                    try {
                        await cloudinary.uploader.destroy(survey.logo.public_id);
                        await Logger.info("updateSurvey: Old logo removed", {
                            oldLogoId: survey.logo.public_id,
                        });
                    } catch (err) {
                        await Logger.warn("updateSurvey: Failed to destroy old logo", {
                            error: err.message,
                            oldLogoId: survey.logo.public_id,
                        });
                    }
                }

                // Assign new logo
                survey.logo = { public_id: result.public_id, url: result.secure_url };
                await Logger.info("updateSurvey: New logo uploaded", {
                    public_id: result.public_id,
                    url: result.secure_url,
                });
            } finally {
                if (req.file.path && fs.existsSync(req.file.path)) {
                    try {
                        fs.unlinkSync(req.file.path);
                        await Logger.info("updateSurvey: Temp file removed", {
                            path: req.file.path,
                        });
                    } catch (e) {
                        await Logger.warn("updateSurvey: Failed to remove temp file", {
                            error: e.message,
                        });
                    }
                }
            }
        }

        // 🔹 Password Protection Logic
        if (req.body.settings && typeof req.body.settings.isPasswordProtected !== "undefined") {
            if (req.body.settings.isPasswordProtected) {
                if (req.body.settings.password) {
                    survey.settings = survey.settings || {};
                    survey.settings.isPasswordProtected = true;
                    survey.settings.password = await bcrypt.hash(
                        String(req.body.settings.password),
                        10
                    );
                    await Logger.info("updateSurvey: Password protection enabled with new password");
                } else if (!survey.settings?.password) {
                    await Logger.warn("updateSurvey: Password missing while enabling protection");
                    return res.status(400).json({
                        message: "Password required when enabling password protection",
                    });
                } else {
                    survey.settings.isPasswordProtected = true;
                }
            } else {
                survey.settings.isPasswordProtected = false;
                survey.settings.password = undefined;
                await Logger.info("updateSurvey: Password protection disabled");
            }
        } else if (req.body.settings?.password) {
            survey.settings = survey.settings || {};
            survey.settings.password = await bcrypt.hash(
                String(req.body.settings.password),
                10
            );
            survey.settings.isPasswordProtected = true;
            await Logger.info("updateSurvey: Password updated");
        }

        await survey.save();

        await Logger.info("updateSurvey: Survey updated successfully", {
            surveyId,
            tenantId: req.user.tenant,
            updatedFields: Object.keys(req.body),
        });

        res.status(200).json({ message: "Survey updated", survey });
    } catch (err) {
        if (uploaded && uploaded.public_id) {
            try {
                await cloudinary.uploader.destroy(uploaded.public_id);
                await Logger.warn("updateSurvey: Rolled back uploaded logo due to error", {
                    uploadedLogoId: uploaded.public_id,
                });
            } catch (cleanupErr) {
                await Logger.error("updateSurvey: Cleanup failed", {
                    error: cleanupErr.message,
                });
            }
        }

        await Logger.error("updateSurvey: Error occurred", {
            error: err.message,
            stack: err.stack,
            surveyId: req.params.id,
            userId: req.user?._id,
        });
        next(err);
    }
};

// ===== DELETE SURVEY =====
exports.deleteSurvey = async (req, res, next) => {
    try {
        await Logger.info("🗑️ Deleting survey...", {
            surveyId: req.params.id,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
        });

        await Survey.findByIdAndUpdate(req.params.id, { deleted: true });

        await Logger.info("✅ Survey deleted successfully", {
            surveyId: req.params.id,
            userId: req.user?._id,
        });

        res.status(200).json({ message: "Survey deleted" });
    } catch (err) {
        await Logger.error("💥 Error deleting survey", {
            surveyId: req.params.id,
            error: err.message,
            stack: err.stack,
        });
        next(err);
    }
};

// ===== TOGGLE ACTIVE/INACTIVE =====
exports.toggleSurveyStatus = async (req, res, next) => {
    try {
        await Logger.info("🔄 Toggling survey status...", {
            surveyId: req.params.id,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
        });

        const survey = await Survey.findById({
            _id: req.params.id,
            tenant: req.user.tenant,
        });

        if (!survey) {
            await Logger.warn("⚠️ Survey not found for status toggle", {
                surveyId: req.params.id,
                userId: req.user?._id,
            });
            return res.status(404).json({ message: "Not found" });
        }

        survey.status = survey.status === "active" ? "inactive" : "active";
        await survey.save();

        await Logger.info("✅ Survey status updated", {
            surveyId: req.params.id,
            newStatus: survey.status,
            userId: req.user?._id,
        });

        res.status(200).json({ message: `Survey is now ${survey.status}` });
    } catch (err) {
        await Logger.error("💥 Error toggling survey status", {
            surveyId: req.params.id,
            error: err.message,
            stack: err.stack,
        });
        next(err);
    }
};

// ===== GENERATE QR CODE =====
exports.getSurveyQRCode = async (req, res, next) => {
    try {
        await Logger.info("📡 Generating QR Code for survey...", {
            surveyId: req.params.id,
            userId: req.user?._id,
        });

        const { id } = req.params;
        const url = `${process.env.FRONTEND_URL}/take-survey/${id}`;
        const qr = await QRCode.toDataURL(url);

        await Logger.info("✅ QR Code generated successfully", {
            surveyId: id,
            url,
        });

        res.status(200).json({ qr });
    } catch (err) {
        await Logger.error("💥 Error generating survey QR Code", {
            surveyId: req.params?.id,
            error: err.message,
            stack: err.stack,
        });
        next(err);
    }
};

// ===== EXPORT SURVEY REPORT PDF =====
exports.exportSurveyReport = async (req, res, next) => {
    try {
        await Logger.info("📊 Exporting survey report...", {
            surveyId: req.params.id,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
        });

        const survey = await Survey.findById({
            _id: req.params.id,
            tenant: req.user.tenant,
        });

        if (!survey) {
            await Logger.warn("⚠️ Survey not found for export", { surveyId: req.params.id });
            return res.status(404).json({ message: "Survey not found" });
        }

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

        stream.on("finish", async () => {
            await Logger.info("✅ Survey report PDF generated", {
                surveyId: survey._id,
                path: filePath,
            });
            res.download(filePath, `survey-${survey._id}.pdf`, () => fs.unlinkSync(filePath));
        });
    } catch (err) {
        await Logger.error("💥 Error exporting survey report", {
            surveyId: req.params?.id,
            error: err.message,
            stack: err.stack,
        });
        next(err);
    }
};

// ===== EXPORT SURVEY REPORT CSV =====
exports.exportResponses = async (req, res, next) => {
    try {
        await Logger.info("📤 Exporting survey responses...", {
            surveyId: req.params.id,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
        });

        const survey = await Survey.findById(req.params.id);
        if (!survey) {
            await Logger.warn("⚠️ Survey not found for response export", { surveyId: req.params.id });
            return res.status(404).json({ message: "Survey not found" });
        }

        const responses = await SurveyResponse.find({ survey: survey._id });
        const fields = ["user", "score", "rating", "review", "createdAt"];
        const parser = new Parser({ fields });
        const csv = parser.parse(responses);

        await Logger.info("✅ Survey responses CSV generated", {
            surveyId: survey._id,
            totalResponses: responses.length
        });

        res.header("Content-Type", "text/csv");
        res.attachment(`survey-${survey._id}-responses.csv`);
        res.send(csv);
    } catch (err) {
        await Logger.error("💥 Error exporting survey responses", {
            surveyId: req.params?.id,
            error: err.message,
            stack: err.stack
        });
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

        await Logger.info("📥 Fetching survey responses started", {
            surveyId,
            userId: req.user?._id,
            tenantId: req.user?.tenant,
            query: req.query
        });

        // Validate surveyId
        if (!mongoose.Types.ObjectId.isValid(surveyId)) {
            await Logger.warn("⚠️ Invalid surveyId provided", { surveyId });
            return res.status(400).json({ message: "Invalid surveyId" });
        }

        // Ensure survey exists and belongs to tenant
        const survey = await Survey.findOne({ _id: surveyId, tenant: req.user.tenant, deleted: false }).select("_id tenant");
        if (!survey) {
            await Logger.warn("⚠️ Survey not found or access denied", { surveyId, tenantId: req.user?.tenant });
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
                if (isNaN(sd)) {
                    await Logger.warn("⚠️ Invalid startDate provided", { startDate });
                    return res.status(400).json({ message: "Invalid startDate" });
                }
                query.createdAt.$gte = sd;
            }
            if (endDate) {
                const ed = new Date(endDate);
                if (isNaN(ed)) {
                    await Logger.warn("⚠️ Invalid endDate provided", { endDate });
                    return res.status(400).json({ message: "Invalid endDate" });
                }
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

        await Logger.info("✅ Survey responses fetched successfully", {
            surveyId,
            total,
            page: pageNum,
            limit: limitNum,
            tenantId: req.user?.tenant
        });

        res.status(200).json({
            total,
            totalPages,
            page: pageNum,
            limit: limitNum,
            responses,
        });
    } catch (err) {
        await Logger.error("💥 Error fetching survey responses", { error: err.message, stack: err.stack });
        next(err);
    }
};

// ===== GET SURVEY ANALYTICS =====
exports.getSurveyAnalytics = async (req, res, next) => {
    try {
        const { surveyId } = req.params;

        await Logger.info("📥 Fetching survey analytics started", {
            surveyId,
            userId: req.user?._id,
            tenantId: req.user?.tenant
        });

        const survey = await Survey.findById(surveyId);
        if (!survey) {
            await Logger.warn("⚠️ Survey not found", { surveyId });
            return res.status(404).json({ message: "Survey not found" });
        }

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

        await Logger.info("✅ Survey analytics fetched successfully", {
            surveyId,
            totalResponses
        });

        res.status(200).json(analytics);
    } catch (err) {
        await Logger.error("💥 Error fetching survey analytics", {
            error: err.message,
            stack: err.stack
        });
        next(err);
    }
};

// ===== VERIFY SURVEY PASSWORD (for protected surveys) =====
exports.verifySurveyPassword = async (req, res, next) => {
    try {
        const { surveyId, password } = req.body;

        await Logger.info("📥 Verifying survey password", { surveyId, userId: req.user?._id });

        const survey = await Survey.findById(surveyId);

        if (!survey || survey.deleted || survey.status !== "active") {
            await Logger.warn("⚠️ Survey not found or inactive", { surveyId });
            return res.status(404).json({ message: "Survey not found" });
        }

        if (!survey.settings?.isPasswordProtected) {
            await Logger.warn("⚠️ Survey is not password protected", { surveyId });
            return res.status(400).json({ message: "Survey is not password protected" });
        }

        const match = await bcrypt.compare(password, survey.settings.password || "");
        if (!match) {
            await Logger.warn("❌ Invalid survey password attempt", { surveyId, userId: req.user?._id });
            return res.status(401).json({ message: "Invalid password" });
        }

        await Logger.info("✅ Survey password verified", { surveyId, userId: req.user?._id });
        res.status(200).json({ message: "Password verified", surveyId: survey._id });
    } catch (err) {
        await Logger.error("💥 Error verifying survey password", { error: err.message, stack: err.stack });
        next(err);
    }
};

// Add to surveyController.js
exports.createQuestion = async (req, res) => {
    try {
        const { id } = req.params; // Survey ID
        const questionData = req.body; // { type, title: { en, ar }, description: { en, ar }, required, options, logic }

        await Logger.info("📥 Adding question to survey", { surveyId: id, userId: req.user?._id, questionData });

        const survey = await Survey.findById(id);
        if (!survey) {
            await Logger.warn("⚠️ Survey not found while adding question", { surveyId: id });
            return res.status(404).json({ message: "Survey not found" });
        }

        survey.questions.push({ ...questionData, id: new mongoose.Types.ObjectId() });
        await survey.save();

        const addedQuestionId = survey.questions[survey.questions.length - 1].id;
        await Logger.info("✅ Question added successfully", { surveyId: id, questionId: addedQuestionId });

        res.status(201).json({ id: addedQuestionId });
    } catch (error) {
        await Logger.error("💥 Failed to add question", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Failed to add question", error });
    }
};

exports.deleteQuestion = async (req, res) => {
    try {
        const { id, questionId } = req.params;

        await Logger.info("📥 Deleting question from survey", { surveyId: id, questionId, userId: req.user?._id });

        const survey = await Survey.findById(id);
        if (!survey) {
            await Logger.warn("⚠️ Survey not found while deleting question", { surveyId: id });
            return res.status(404).json({ message: "Survey not found" });
        }

        survey.questions = survey.questions.filter(q => q.id.toString() !== questionId);
        await survey.save();

        await Logger.info("✅ Question deleted successfully", { surveyId: id, questionId });
        res.status(200).json({ message: "Question deleted" });
    } catch (error) {
        await Logger.error("💥 Failed to delete question", { error: error.message, stack: error.stack });
        res.status(500).json({ message: "Failed to delete question", error });
    }
};

// ===== TARGET AUDIENCE & SCHEDULING =====
exports.setTargetAudience = async (req, res, next) => {
    try {
        const { surveyId } = req.params;
        const { targetAudience } = req.body;

        await Logger.info("🎯 Setting target audience for survey", {
            surveyId,
            targetAudience,
            userId: req.user?._id,
            tenantId: req.user?.tenant
        });

        // Validate surveyId
        if (!mongoose.Types.ObjectId.isValid(surveyId)) {
            await Logger.warn("⚠️ Invalid surveyId provided", { surveyId });
            return res.status(400).json({ message: "Invalid survey ID" });
        }

        // Validate targetAudience
        const validAudiences = ["employee", "customer", "public", "vendor", "guest", "student", "patient", "all"];
        if (!Array.isArray(targetAudience) || !targetAudience.every(audience => validAudiences.includes(audience))) {
            await Logger.warn("⚠️ Invalid target audience provided", { targetAudience });
            return res.status(400).json({
                message: "Invalid target audience. Valid options: " + validAudiences.join(", ")
            });
        }

        // Find and update survey
        const survey = await Survey.findOne({
            _id: surveyId,
            tenant: req.user.tenant,
            deleted: false
        });

        if (!survey) {
            await Logger.warn("⚠️ Survey not found or access denied", {
                surveyId,
                tenantId: req.user?.tenant
            });
            return res.status(404).json({ message: "Survey not found or access denied" });
        }

        // Update target audience
        survey.targetAudience = targetAudience;
        await survey.save();

        await Logger.info("✅ Target audience updated successfully", {
            surveyId,
            targetAudience,
            tenantId: req.user?.tenant
        });

        res.status(200).json({
            message: "Target audience updated successfully",
            survey: {
                _id: survey._id,
                title: survey.title,
                targetAudience: survey.targetAudience,
                status: survey.status
            }
        });

    } catch (err) {
        await Logger.error("💥 Error setting target audience", {
            error: err.message,
            stack: err.stack,
            surveyId: req.params?.surveyId,
            userId: req.user?._id
        });
        next(err);
    }
};

exports.scheduleSurvey = async (req, res, next) => {
    try {
        const { surveyId } = req.params;
        const { startDate, endDate, timezone, autoPublish, repeat } = req.body;

        await Logger.info("📅 Scheduling survey", {
            surveyId,
            startDate,
            endDate,
            autoPublish,
            userId: req.user?._id,
            tenantId: req.user?.tenant
        });

        // Validate surveyId
        if (!mongoose.Types.ObjectId.isValid(surveyId)) {
            await Logger.warn("⚠️ Invalid surveyId provided", { surveyId });
            return res.status(400).json({ message: "Invalid survey ID" });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : null;

        if (isNaN(start.getTime())) {
            await Logger.warn("⚠️ Invalid start date provided", { startDate });
            return res.status(400).json({ message: "Invalid start date" });
        }

        if (end && isNaN(end.getTime())) {
            await Logger.warn("⚠️ Invalid end date provided", { endDate });
            return res.status(400).json({ message: "Invalid end date" });
        }

        if (end && start >= end) {
            await Logger.warn("⚠️ Start date must be before end date", { startDate, endDate });
            return res.status(400).json({ message: "Start date must be before end date" });
        }

        // Find survey
        const survey = await Survey.findOne({
            _id: surveyId,
            tenant: req.user.tenant,
            deleted: false
        });

        if (!survey) {
            await Logger.warn("⚠️ Survey not found or access denied", {
                surveyId,
                tenantId: req.user?.tenant
            });
            return res.status(404).json({ message: "Survey not found or access denied" });
        }

        // Update schedule
        survey.schedule = {
            startDate: start,
            endDate: end,
            timezone: timezone || "UTC",
            autoPublish: autoPublish || false,
            publishedAt: null,
            repeat: repeat || { enabled: false, frequency: "none" }
        };

        // Set status based on schedule and current time
        const now = new Date();
        if (start <= now && autoPublish) {
            // Should be published immediately
            survey.status = "active";
            survey.schedule.publishedAt = now;
            await Logger.info("📢 Survey published immediately", { surveyId });
        } else if (start > now && autoPublish) {
            // Schedule for future publishing
            survey.status = "scheduled";
            await Logger.info("⏰ Survey scheduled for future publishing", {
                surveyId,
                scheduledFor: start
            });
        }

        await survey.save();

        await Logger.info("✅ Survey scheduled successfully", {
            surveyId,
            status: survey.status,
            startDate: start,
            endDate: end,
            tenantId: req.user?.tenant
        });

        res.status(200).json({
            message: "Survey scheduled successfully",
            survey: {
                _id: survey._id,
                title: survey.title,
                status: survey.status,
                schedule: survey.schedule,
                targetAudience: survey.targetAudience
            }
        });

    } catch (err) {
        await Logger.error("💥 Error scheduling survey", {
            error: err.message,
            stack: err.stack,
            surveyId: req.params?.surveyId,
            userId: req.user?._id
        });
        next(err);
    }
};

// ===== AUTO-PUBLISH CRON JOB FUNCTION =====
exports.autoPublishScheduledSurveys = async () => {
    try {
        const now = new Date();

        // Find all surveys that should be published NOW
        const scheduledSurveys = await Survey.find({
            status: "scheduled",
            "schedule.startDate": { $lte: now },
            "schedule.autoPublish": true
        }).lean(); // .lean() for faster processing

        if (scheduledSurveys.length === 0) {
            console.log("No surveys to auto-publish at this time.");
            return;
        }

        console.log(`Found ${scheduledSurveys.length} survey(s) to auto-publish`);

        for (const survey of scheduledSurveys) {
            try {
                // Update survey status
                const updatedSurvey = await Survey.findById(survey._id);

                updatedSurvey.status = "active";
                updatedSurvey.schedule.publishedAt = now;

                // Build recipients
                const phones = updatedSurvey.targetAudience?.phones || [];
                const emails = updatedSurvey.targetAudience?.emails || [];
                const recipients = [...phones, ...emails];

                // Update publish log
                updatedSurvey.publishLog.push({
                    publishedBy: null, // system/cron
                    method: "cron-auto",
                    recipientsCount: recipients.length,
                    timestamp: now
                });

                // Save first
                await updatedSurvey.save();

                // Send WhatsApp in background (fire and forget)
                if (recipients.length > 0) {
                    sendSurveyWhatsApp({
                        body: {
                            surveyId: updatedSurvey._id.toString(),
                            recipients
                        },
                        tenantId: updatedSurvey.tenant,
                        user: { _id: "cron-system" } // optional
                    }).catch(err => {
                        console.error(`WhatsApp failed for survey ${updatedSurvey._id}:`, err.message);
                        Logger.error("WhatsApp send failed in cron", {
                            surveyId: updatedSurvey._id,
                            error: err.message
                        });
                    });
                }

                await Logger.info("Survey auto-published successfully", {
                    surveyId: updatedSurvey._id,
                    title: updatedSurvey.title,
                    recipientsCount: recipients.length
                });

                console.log(`Auto-published: ${updatedSurvey.title} (${recipients.length} recipients)`);

            } catch (surveyError) {
                console.error(`Failed to publish survey ${survey._id}:`, surveyError);
                await Logger.error("Single survey auto-publish failed", {
                    surveyId: survey._id,
                    error: surveyError.message
                });
            }
        }

        console.log(`Cron job completed: ${scheduledSurveys.length} surveys processed.`);

    } catch (err) {
        console.error("CRON autoPublishScheduledSurveys FAILED:", err);
        await Logger.error("CRON auto-publish job crashed", {
            error: err.message,
            stack: err.stack
        });
    }
};