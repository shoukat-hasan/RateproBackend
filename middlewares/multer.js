// middlewares/multer.js

const multer = require("multer");
const path = require("path");

// Storage config (temp only, Cloudinary will be used later)
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, "uploads/");
  },
  filename(req, file, cb) {
    cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);

  if (ext && mime) return cb(null, true);
  cb(new Error("Only images allowed (jpeg, jpg, png, webp)"));
};

const upload = multer({ storage, fileFilter });

module.exports = upload;
