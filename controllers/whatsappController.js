// // controllers/whatsappController.js
// const WhatsAppSetting = require('../models/WhatsAppSetting');
// const Joi = require('joi');

// const schema = Joi.object({
//   provider: Joi.string().valid('twilio','meta').required(),
//   twilio: Joi.object({
//     accountSid: Joi.string().allow('', null),
//     authToken: Joi.string().allow('', null),
//     fromNumber: Joi.string().allow('', null),
//   }).optional(),
//   meta: Joi.object({
//     phoneNumberId: Joi.string().allow('', null),
//     accessToken: Joi.string().allow('', null),
//     fromNumber: Joi.string().allow('', null),
//   }).optional(),
//   isActive: Joi.boolean().optional(),
// });

// exports.upsertWhatsAppSetting = async (req, res, next) => {
//   try {
//     const { error, value } = schema.validate(req.body);
//     if (error) return res.status(400).json({ message: error.details[0].message });

//     const tenantId = req.tenantId;
//     if (!tenantId) return res.status(403).json({ message: 'No tenant' });

//     let setting = await WhatsAppSetting.findOne({ tenant: tenantId });
//     if (!setting) {
//       setting = new WhatsAppSetting(Object.assign({}, value, { tenant: tenantId, createdBy: req.user._id }));
//     } else {
//       Object.assign(setting, value);
//     }
//     await setting.save();
//     res.status(200).json({ message: 'WhatsApp settings saved', setting });
//   } catch (err) {
//     next(err);
//   }
// };

// exports.getWhatsAppSetting = async (req, res, next) => {
//   try {
//     const tenantId = req.tenantId;
//     let setting = await WhatsAppSetting.findOne({ tenant: tenantId });
//     if (!setting) return res.status(404).json({ message: 'No settings found' });
//     res.status(200).json({ setting });
//   } catch (err) {
//     next(err);
//   }
// };

// controllers/whatsappController.js
const WhatsAppSetting = require('../models/WhatsAppSetting');
const Joi = require('joi');
const Logger = require("../utils/auditLog");

const schema = Joi.object({
  provider: Joi.string().valid('twilio','meta').required(),
  twilio: Joi.object({
    accountSid: Joi.string().allow('', null),
    authToken: Joi.string().allow('', null),
    fromNumber: Joi.string().allow('', null),
  }).optional(),
  meta: Joi.object({
    phoneNumberId: Joi.string().allow('', null),
    accessToken: Joi.string().allow('', null),
    fromNumber: Joi.string().allow('', null),
  }).optional(),
  isActive: Joi.boolean().optional(),
});

// Create or update WhatsApp settings
exports.upsertWhatsAppSetting = async (req, res, next) => {
  try {
    const { error, value } = schema.validate(req.body);
    if (error) {
      await Logger.warn("WhatsApp setting validation failed", { error: error.details[0].message, body: req.body, userId: req.user?._id });
      return res.status(400).json({ message: error.details[0].message });
    }

    const tenantId = req.tenantId;
    if (!tenantId) {
      await Logger.warn("WhatsApp setting attempt without tenant", { userId: req.user?._id });
      return res.status(403).json({ message: 'No tenant' });
    }

    let setting = await WhatsAppSetting.findOne({ tenant: tenantId });
    if (!setting) {
      await Logger.info("Creating new WhatsApp setting", { tenantId, userId: req.user?._id });
      setting = new WhatsAppSetting(Object.assign({}, value, { tenant: tenantId, createdBy: req.user._id }));
    } else {
      await Logger.info("Updating existing WhatsApp setting", { tenantId, userId: req.user?._id });
      Object.assign(setting, value);
    }

    await setting.save();
    await Logger.info("WhatsApp setting saved successfully", { tenantId, userId: req.user?._id, settingId: setting._id });

    res.status(200).json({ message: 'WhatsApp settings saved', setting });
  } catch (err) {
    await Logger.error("Error saving WhatsApp setting", { error: err.message, stack: err.stack });
    next(err);
  }
};

// Get WhatsApp settings
exports.getWhatsAppSetting = async (req, res, next) => {
  try {
    const tenantId = req.tenantId;
    await Logger.info("Fetching WhatsApp setting", { tenantId, userId: req.user?._id });
    let setting = await WhatsAppSetting.findOne({ tenant: tenantId });
    if (!setting) {
      await Logger.warn("No WhatsApp settings found", { tenantId, userId: req.user?._id });
      return res.status(404).json({ message: 'No settings found' });
    }

    await Logger.info("WhatsApp setting retrieved successfully", { tenantId, userId: req.user?._id, settingId: setting._id });
    res.status(200).json({ setting });
  } catch (err) {
    await Logger.error("Error fetching WhatsApp setting", { error: err.message, stack: err.stack, userId: req.user?._id });
    next(err);
  }
};