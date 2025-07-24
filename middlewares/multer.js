// // middlewares/multer.js

// const multer = require("multer");
// const path = require("path");

// // Storage config (temp only, Cloudinary will be used later)
// const storage = multer.diskStorage({
//   destination(req, file, cb) {
//     cb(null, "uploads/");
//   },
//   filename(req, file, cb) {
//     cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
//   },
// });

// // File filter
// const fileFilter = (req, file, cb) => {
//   const allowed = /jpeg|jpg|png|webp/;
//   const ext = allowed.test(path.extname(file.originalname).toLowerCase());
//   const mime = allowed.test(file.mimetype);

//   if (ext && mime) return cb(null, true);
//   cb(new Error("Only images allowed (jpeg, jpg, png, webp)"));
// };

// const upload = multer({ storage, fileFilter });

// module.exports = upload;

// const multer = require("multer");

// // Store in memory instead of disk
// const storage = multer.memoryStorage();

// // File filter
// const fileFilter = (req, file, cb) => {
//   const allowed = /jpeg|jpg|png|webp/;
//   const ext = allowed.test(file.originalname.toLowerCase());
//   const mime = allowed.test(file.mimetype);

//   if (ext && mime) return cb(null, true);
//   cb(new Error("Only images allowed (jpeg, jpg, png, webp)"));
// };

// const upload = multer({ storage, fileFilter });

// module.exports = upload;

const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = "uploads/";

// ✅ Auto-create the folder if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ✅ Multer storage
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    cb(null, `avatar-${Date.now()}${path.extname(file.originalname)}`);
  },
});

// ✅ File filter
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);

  if (ext && mime) cb(null, true);
  else cb(new Error("Only images allowed (jpeg, jpg, png, webp)"));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
});

module.exports = upload;
