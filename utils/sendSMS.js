// utils/sendSMS.js
const twilio = require("twilio");

const client = twilio(
  process.env.SMS_PROVIDER_SID,
  process.env.SMS_PROVIDER_AUTH_TOKEN
);

/**
 * Send SMS using Twilio (or another provider if swapped later).
 * @param {Object} options
 * @param {string} options.to - Recipient phone number (E.164 format, e.g. +15555555555)
 * @param {string} options.body - Message text
 */
exports.sendSMS = async ({ to, body }) => {
  try {
    const message = await client.messages.create({
      body,
      to,
      from: process.env.SMS_PROVIDER_NUMBER, // Twilio sender number
    });

    return { sid: message.sid, status: message.status };
  } catch (err) {
    console.error("SMS Send Error:", err);
    throw new Error("SMS service failed. Please try again later.");
  }
};
