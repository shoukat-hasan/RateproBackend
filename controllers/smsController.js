// controllers/smsController.js
const { sendSMS } = require("../utils/sendSMS");
const Logger = require("../utils/auditLog");

// POST: Send SMS
exports.sendSMSHandler = async (req, res, next) => {
  try {
    const { to, body } = req.body;

    // --- Validate input ---
    if (!to || !body) {
      await Logger.warn("sendSMSHandler: Missing required fields", {
        receivedBody: req.body,
        performedBy: req.user?._id,
      });
      return res.status(400).json({ message: "Recipient number and message body are required" });
    }
    // --- Send SMS ---
    const result = await sendSMS({ to, body });

    await Logger.info("sendSMSHandler: SMS sent successfully", {
      to,
      messageLength: body.length,
      performedBy: req.user?._id,
      providerResponse: result,
    });

    return res.status(200).json({ message: "SMS sent successfully" });
  } catch (err) {
    await Logger.error("sendSMSHandler: Error sending SMS", {
      error: err.message,
      stack: err.stack,
      performedBy: req.user?._id,
      tenantId: req.tenantId,
    });
    next(err);
  }
};