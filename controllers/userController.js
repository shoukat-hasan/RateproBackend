const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const cloudinary = require("../utils/cloudinary");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// === CREATE USER ===
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      createdBy: req.user._id,
      company: req.user.role === "company" ? req.user._id : undefined,
    });

    res.status(201).json({ message: "User created", user });
  } catch (err) {
    next(err);
  }
};

// === UPDATE USER ===
exports.updateUser = async (req, res, next) => {
  try {
    const { name, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (req.file) {
      if (user.avatar?.public_id)
        await cloudinary.uploader.destroy(user.avatar.public_id);

      const uploaded = await cloudinary.uploader.upload(req.file.path, {
        folder: "avatars",
      });

      user.avatar = {
        public_id: uploaded.public_id,
        url: uploaded.secure_url,
      };
    }

    if (name) user.name = name;
    if (role) user.role = role;

    await user.save();
    res.status(200).json({ message: "User updated", user });
  } catch (err) {
    next(err);
  }
};

// === DELETE USER (soft delete) ===
exports.deleteUser = async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { deleted: true });
    res.status(200).json({ message: "User deleted" });
  } catch (err) {
    next(err);
  }
};

// === TOGGLE ACTIVE/INACTIVE ===
exports.toggleActive = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({ message: `User is now ${user.isActive ? "active" : "inactive"}` });
  } catch (err) {
    next(err);
  }
};

// === GET ALL USERS (Search, Pagination, Filter) ===
exports.getAllUsers = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sort = "createdAt",
      role,
      active,
    } = req.query;

    const query = {
      deleted: false,
      name: { $regex: search, $options: "i" },
    };

    if (role) query.role = role;
    if (active !== undefined) query.isActive = active === "true";

    // If company role — restrict to own users
    if (req.user.role === "company") query.company = req.user._id;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .sort({ [sort]: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.status(200).json({ total, page, users });
  } catch (err) {
    next(err);
  }
};

// === GET SINGLE USER ===
exports.getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.status(200).json(user);
  } catch (err) {
    next(err);
  }
};

// === EXPORT USER DATA IN PDF ===
exports.exportUserDataPDF = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const doc = new PDFDocument();
    const filePath = `./uploads/user-${user._id}.pdf`;
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text("User Data Report", { align: "center" });
    doc.moveDown();
    doc.text(`Name: ${user.name}`);
    doc.text(`Email: ${user.email}`);
    doc.text(`Role: ${user.role}`);
    doc.text(`Active: ${user.isActive}`);
    doc.text(`Verified: ${user.isVerified}`);
    doc.moveDown();
    doc.fontSize(16).text("Survey Stats:");
    doc.text(`Total Surveys Taken: ${user.surveyStats.totalSurveysTaken}`);
    doc.text(`Total Responses: ${user.surveyStats.totalResponses}`);
    doc.text(`Average Score: ${user.surveyStats.averageScore}`);

    doc.end();

    stream.on("finish", () => {
      res.download(filePath, `user-${user._id}.pdf`, () => {
        fs.unlinkSync(filePath);
      });
    });
  } catch (err) {
    next(err);
  }
};

// === SEND NOTIFICATION EMAIL TO USER ===
exports.sendNotification = async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    await sendEmail({
      to: user.email,
      subject,
      html: `<p>${message}</p>`,
    });

    res.status(200).json({ message: "Notification email sent" });
  } catch (err) {
    next(err);
  }
};
