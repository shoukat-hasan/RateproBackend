// controllers/smsController.js
const { sendSMS } = require("../utils/sendSMS");

exports.sendSMSHandler = async (req, res, next) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ message: "Missing fields" });

    await sendSMS({ to, body });
    res.status(200).json({ message: "SMS sent successfully" });
  } catch (err) {
    next(err);
  }
};
