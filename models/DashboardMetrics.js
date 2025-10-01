// models/DashboardMetrics.js

const mongoose = require("mongoose");

const DashboardMetricsSchema = new mongoose.Schema({
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    satisfactionIndex: Number,
    npsTrend: [{ month: String, value: Number }],
    topComplaints: [{ category: String, count: Number }],
    updatedAt: { type: Date, default: Date.now },
});
DashboardMetricsSchema.index({ tenant: 1 });
module.exports = mongoose.model('DashboardMetrics', DashboardMetricsSchema);