// controllers/insightController.js
const { calculateNPS, generateSentimentHeatmap, generateTrendline } = require("../utils/insightUtils");

const getPredictiveInsights = async (req, res) => {
  const { surveyId } = req.params;
  try {
    const nps = await calculateNPS(surveyId);
    const sentimentHeatmap = await generateSentimentHeatmap(surveyId);
    const trendline = await generateTrendline(surveyId);

    res.json({ nps, sentimentHeatmap, trendline });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { getPredictiveInsights };
