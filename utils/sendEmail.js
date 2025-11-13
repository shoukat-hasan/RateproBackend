const nodemailer = require("nodemailer");
const EmailTemplate = require("../models/EmailTemplate");
// const emailTemplate = require("./emailTemplate");

const sendEmail = async ({ to, subject, html, text, templateType, templateData }) => {
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    let finalHTML = html;

    // 🧠 STEP 1: Handle Template Rendering
    if (templateType && templateData) {
      const templateDoc = await EmailTemplate.findOne({ type: templateType, isActive: true });
      if (!templateDoc) throw new Error("Email template not found");

      finalHTML = templateDoc.body;

      Object.keys(templateData).forEach((key) => {
        // const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
        const regex = new RegExp(`\\$\\{\\s*${key}\\s*\\}`, "g");
        console.log(`🧠 Replacing {{${key}}} →`, templateData[key]);

        if (finalHTML.match(regex)) {
        } else {
          console.warn(`⚠️ Not found in template: {{${key}}}`);
        }

        finalHTML = finalHTML.replace(regex, templateData[key]);
      });
    }

    // 🧠 STEP 2: Fallback if no HTML found
    if (!finalHTML) {
      finalHTML = "<p>No content provided.</p>";
    }

    // 🧠 STEP 3: Build mail options
    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to,
      subject: subject || "Notification",
      html: finalHTML,
      text,
    };

    // 🧠 STEP 4: Send Email
    const info = await transporter.sendMail(mailOptions);

  } catch (error) {
    console.error("🔥 [FATAL ERROR in sendEmail]:", error.message);
    console.error(error.stack);
    throw error; // bubble up to controller to trigger fallback
  }
};

module.exports = sendEmail;