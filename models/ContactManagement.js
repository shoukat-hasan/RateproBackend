// models/ContactManagement.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
    name:
    {
        type: String,
        required: true
    },

    email:
    {
        type: String,
        required: true,
        unique: true
    },

    phone:
    {
        type: String
    },

    company:
    {
        type: String
    },
    segment:
    {
        type: mongoose.Schema.Types.ObjectId,
        ref: "AudienceSegment"
    },

    tags:
    {
        type: String
    },

    status:
    {
        type: String,
        enum: ["Active", "Inactive", "Blocked"], default: "Active"
    },

    tenantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Tenant",
        required: function () {
            return this.role === "companyAdmin" || this.role === "member";
        },
    },
    lastActivity:
    {
        type: Date,
        default: Date.now
    },

    createdAt:
    {
        type: Date,
        default: Date.now
    },
});

module.exports = mongoose.model("Contact", ContactSchema);