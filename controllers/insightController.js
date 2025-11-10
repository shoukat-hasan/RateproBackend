// controllers/insightController.js
const { calculateNPS, generateSentimentHeatmap, generateTrendline } = require("../utils/insightUtils");
const Logger = require("../utils/auditLog");

const getPredictiveInsights = async (req, res) => {
  const { surveyId } = req.params;
  try {
    const nps = await calculateNPS(surveyId);
    const sentimentHeatmap = await generateSentimentHeatmap(surveyId);
    const trendline = await generateTrendline(surveyId);

    await Logger.info("getPredictiveInsights: Insights generated successfully", {
      surveyId,
      npsScore: nps?.score,
      sentimentCount: sentimentHeatmap?.length || 0,
    });

    res.json({ nps, sentimentHeatmap, trendline });
  } catch (err) {
    await Logger.error("getPredictiveInsights: Error generating insights", {
      surveyId,
      message: err.message,
      stack: err.stack,
    });
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getPredictiveInsights };