// RateproBackend/models/AudienceSegment.js
const mongoose = require("mongoose");

const audienceSegmentSchema = new mongoose.Schema({
    name:
    {
        type: String,
        required: true
    },

    description:
    {
        type: String
    },

    criteria:
    {
        type: String
    },

    size:
    {
        type: Number,
        default: 0
    },

    status:
    {
        type: String,
        enum: ["Active", "Draft"],
        default: "Draft"
    },
    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        required: function () {
            return this.role === "companyAdmin" || this.role === "member";
        },
    },
    created:
    {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("AudienceSegment", audienceSegmentSchema);