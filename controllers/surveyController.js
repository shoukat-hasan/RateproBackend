// controllers\surveyController.js

const Survey = require("../models/Survey");
const SurveyResponse = require("../models/SurveyResponse");
const cloudinary = require("../utils/cloudinary");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const path = require("path");

// ===== CREATE SURVEY =====
exports.createSurvey = async (req, res, next) => {
    try {
        const {
            title, description, category,
            questions, settings, themeColor
        } = req.body;

        const newSurvey = new Survey({
            title, description, category,
            questions, settings, themeColor,
            createdBy: req.user._id,
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
exports.getPublicSurveys = async (req, res) => {
    const surveys = await Survey.find({
        "settings.isPublic": true,
        status: "active",
        deleted: false,
    }).select("title description category createdAt");

    res.status(200).json(surveys);
};

// ===== GET SINGLE SURVEY =====
exports.getSurveyById = async (req, res, next) => {
    try {
        const survey = await Survey.findById(req.params.id).populate("createdBy", "name");
        if (!survey || survey.deleted) return res.status(404).json({ message: "Not found" });
        res.status(200).json(survey);
    } catch (err) {
        next(err);
    }
};

// ===== TAKE SURVEY / SUBMIT RESPONSE =====
exports.submitSurvey = async (req, res, next) => {
    try {
        const { surveyId, answers, review, score, rating } = req.body;
        const ip = req.ip;
        const userId = req.user?._id;

        const survey = await Survey.findById(surveyId);
        if (!survey || survey.deleted) return res.status(404).json({ message: "Survey not found" });

        // Block double submission
        const exists = await SurveyResponse.findOne({
            survey: surveyId,
            $or: [{ user: userId }, { ip }],
        });
        if (exists) return res.status(400).json({ message: "You already submitted this survey" });

        const response = new SurveyResponse({
            survey: surveyId,
            user: userId,
            answers,
            review,
            score,
            rating,
            isAnonymous: survey.settings?.isAnonymous || false,
            ip,
        });

        await response.save();

        // Update stats
        const allResponses = await SurveyResponse.find({ survey: surveyId });
        const total = allResponses.length;
        const avgScore = allResponses.reduce((sum, r) => sum + (r.score || 0), 0) / total;
        const avgRating = allResponses.reduce((sum, r) => sum + (r.rating || 0), 0) / total;

        survey.totalResponses = total;
        survey.averageScore = Math.round(avgScore || 0);
        survey.averageRating = Math.round(avgRating || 0);
        await survey.save();

        res.status(201).json({ message: "Survey submitted", response });
    } catch (err) {
        next(err);
    }
};

// ===== UPDATE SURVEY =====
exports.updateSurvey = async (req, res, next) => {
    try {
        const survey = await Survey.findById(req.params.id);
        if (!survey) return res.status(404).json({ message: "Survey not found" });

        Object.assign(survey, req.body);

        // New logo?
        if (req.file) {
            if (survey.logo?.public_id) await cloudinary.uploader.destroy(survey.logo.public_id);
            const result = await cloudinary.uploader.upload(req.file.path, { folder: "survey-logos" });
            survey.logo = { public_id: result.public_id, url: result.secure_url };
        }

        await survey.save();
        res.status(200).json({ message: "Survey updated", survey });
    } catch (err) {
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
        const survey = await Survey.findById(req.params.id);
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
        const survey = await Survey.findById(req.params.id);
        if (!survey) return res.status(404).json({ message: "Survey not found" });

        const responses = await SurveyResponse.find({ survey: survey._id });

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
// ===== GET SURVEY RESPONSES =====
exports.getSurveyResponses = async (req, res, next) => {
    try {
        const { surveyId } = req.params;
        const responses = await SurveyResponse.find({ survey: surveyId })
            .populate("user", "name email")
            .sort("-createdAt");
        if (!responses) return res.status(404).json({ message: "No responses found" });
        res.status(200).json(responses);
    } catch (err) {
        next(err);
    }
}
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