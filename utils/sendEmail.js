// utils/sendEmail.js
const nodemailer = require("nodemailer");
const EmailTemplate = require("../models/EmailTemplate");

const sendEmail = async ({ to, subject, html, text, templateType, templateData }) => {
  console.log("📩 [sendEmail] Function triggered...");
  console.log("📨 Args:", { to, subject, templateType, hasHTML: !!html });

  try {
    // -------------------- 1. TRANSPORTER INIT --------------------
    console.log("⚙️ Creating transporter...");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    console.log("✔️ Transporter created");

    let finalHTML = html;

    // -------------------- 2. TEMPLATE HANDLING --------------------
    if (templateType && templateData) {
      console.log("🧩 Template mode enabled:", templateType);
      const templateDoc = await EmailTemplate.findOne({ type: templateType, isActive: true });

      if (!templateDoc) {
        console.error("❌ Template not found in database:", templateType);
        throw new Error("Email template not found");
      }

      console.log("📄 Template found:", templateDoc.type);

      finalHTML = templateDoc.body;

      console.log("🔍 Starting replacements...");
      Object.keys(templateData).forEach((key) => {
        const regex = new RegExp(`\\$\\{\\s*${key}\\s*\\}`, "g");

        console.log(`→ Checking key: ${key}`);
        if (!finalHTML.match(regex)) {
          console.warn(`⚠️ Placeholder not found in template: \${${key}}`);
        } else {
          console.log(`✔️ Replacing \${${key}} with:`, templateData[key]);
        }

        finalHTML = finalHTML.replace(regex, templateData[key]);
      });
    }

    // -------------------- 3. FALLBACK --------------------
    if (!finalHTML) {
      console.warn("⚠️ No HTML provided — using fallback");
      finalHTML = "<p>No content provided.</p>";
    }

    // -------------------- 4. BUILD MAIL OPTIONS --------------------
    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to,
      subject: subject || "Notification",
      html: finalHTML,
      text,
    };

    console.log("📦 Mail options prepared:", {
      to: mailOptions.to,
      subject: mailOptions.subject,
      htmlLength: mailOptions.html?.length,
    });

    // -------------------- 5. SEND EMAIL --------------------
    console.log("🚀 Sending email...");
    const info = await transporter.sendMail(mailOptions);

    console.log("✅ Email sent successfully!");
    console.log("📤 Response:", info);

    return info;

  } catch (error) {
    console.error("🔥 [FATAL ERROR in sendEmail]:", error.message);
    console.error("🔍 STACK:", error.stack);
    throw error;
  }
};

module.exports = sendEmail;