// controllers/dashboardController.js
const Survey = require("../models/Survey");
const SurveyResponse = require("../models/SurveyResponse");
const FeedbackAnalysis = require("../models/FeedbackAnalysis");
const Action = require("../models/Action");
const DashboardMetrics = require("../models/DashboardMetrics");
const mongoose = require("mongoose");

// Executive: high level KPIs (satisfaction index, NPS, trends)
exports.getExecutiveDashboard = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    // Try pre-aggregated metrics first
    let metrics = await DashboardMetrics.findOne({ tenant: tenantId });
    if (!metrics) {
      // Fallback: compute on the fly (lightweight)
      const [totalSurveys, totalResponses] = await Promise.all([
        Survey.countDocuments({ tenant: tenantId, deleted: false }),
        SurveyResponse.countDocuments({ tenant: tenantId }),
      ]);

      // Basic NPS calc using any survey responses with rating/score
      const responses = await SurveyResponse.find({ tenant: tenantId }).select("score rating createdAt").lean();
      const total = responses.length;
      const avgRating = total ? (responses.reduce((s, r) => s + (r.rating || 0), 0) / total) : 0;
      const avgScore = total ? (responses.reduce((s, r) => s + (r.score || 0), 0) / total) : 0;

      // compute simple NPS if surveys include 'nps' answers in 'answers' array (optional) - skip for now
      metrics = {
        satisfactionIndex: Math.round(avgRating * 20), // convert 1-5 to 0-100 scale
        npsTrend: [], // requires timeseries aggregation
        topComplaints: [], // requires FeedbackAnalysis categories count
        updatedAt: new Date(),
        totalSurveys,
        totalResponses,
        averageRating: Number(avgRating.toFixed(2)),
        averageScore: Number(avgScore.toFixed(2)),
      };
    }

    res.status(200).json({ metrics });
  } catch (err) {
    next(err);
  }
};

// Operational: recent alerts, SLA, open actions, top complaints
exports.getOperationalDashboard = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;

    const [
      recentNegativeFeedback,
      openActionsCount,
      slaAvgResponseTime, // placeholder
      topComplaintCategories
    ] = await Promise.all([
      FeedbackAnalysis.find({ tenant: tenantId, sentiment: "negative" }).sort("-createdAt").limit(10).populate({
        path: "response",
        populate: { path: "survey", select: "title" }
      }),
      Action.countDocuments({ tenant: tenantId, status: { $in: ["open", "in-progress"] } }),
      Promise.resolve(null),
      FeedbackAnalysis.aggregate([
        { $match: { tenant: mongoose.Types.ObjectId(tenantId) } },
        { $unwind: { path: "$categories", preserveNullAndEmptyArrays: false } },
        { $group: { _id: "$categories", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ])
    ]);

    const topComplaints = topComplaintCategories.map(c => ({ category: c._id, count: c.count }));

    res.status(200).json({
      recentNegativeFeedback,
      openActionsCount,
      slaAvgResponseTime,
      topComplaints,
    });
  } catch (err) {
    next(err);
  }
};

// module.exports = { getExecutiveDashboard, getOperationalDashboard };
