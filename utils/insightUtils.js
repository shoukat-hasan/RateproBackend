// utils/insightUtils.js
const SurveyResponse = require("../models/SurveyResponse");
const FeedbackAnalysis = require("../models/FeedbackAnalysis");

/**
 * Calculate NPS (Net Promoter Score)
 * Formula: %Promoters - %Detractors
 * Promoters: score >= 9
 * Passives: 7-8
 * Detractors: <= 6
 */
async function calculateNPS(surveyId) {
  const responses = await SurveyResponse.find({ survey: surveyId, score: { $ne: null } });

  if (!responses.length) return { nps: 0, promoters: 0, passives: 0, detractors: 0 };

  const promoters = responses.filter(r => r.score >= 9).length;
  const passives = responses.filter(r => r.score >= 7 && r.score <= 8).length;
  const detractors = responses.filter(r => r.score <= 6).length;

  const total = responses.length;
  const nps = ((promoters / total) * 100) - ((detractors / total) * 100);

  return { nps: Math.round(nps), promoters, passives, detractors, total };
}

/**
 * Generate Sentiment Heatmap
 * Groups sentiment by month-year
 */
async function generateSentimentHeatmap(surveyId) {
  const pipeline = [
    { $match: { survey: surveyId } },
    {
      $group: {
        _id: {
          month: { $month: "$createdAt" },
          year: { $year: "$createdAt" },
          sentiment: "$sentiment"
        },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        month: "$_id.month",
        year: "$_id.year",
        sentiment: "$_id.sentiment",
        count: 1,
        _id: 0
      }
    },
    { $sort: { year: 1, month: 1 } }
  ];

  return await FeedbackAnalysis.aggregate(pipeline);
}

/**
 * Generate Trendline
 * Average rating per week
 */
async function generateTrendline(surveyId) {
  const pipeline = [
    { $match: { survey: surveyId } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          week: { $week: "$createdAt" }
        },
        avgRating: { $avg: "$rating" },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        year: "$_id.year",
        week: "$_id.week",
        avgRating: { $round: ["$avgRating", 1] },
        count: 1,
        _id: 0
      }
    },
    { $sort: { year: 1, week: 1 } }
  ];

  return await SurveyResponse.aggregate(pipeline);
}

module.exports = { calculateNPS, generateSentimentHeatmap, generateTrendline };
