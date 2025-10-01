// models/WhatsAppSetting.js
const mongoose = require('mongoose');

const whatsappSettingSchema = new mongoose.Schema({
  tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  provider: { type: String, enum: ['twilio', 'meta'], default: 'twilio' },
  // Twilio config
  twilio: {
    accountSid: String,
    authToken: String,
    fromNumber: String, // WhatsApp number in format "whatsapp:+1234567890"
  },
  // Meta (WhatsApp Cloud API) config
  meta: {
    phoneNumberId: String, // e.g., '1234567890'
    accessToken: String, // page access token
    fromNumber: String, // sender phone number id or formatted number
  },
  isActive: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('WhatsAppSetting', whatsappSettingSchema);
