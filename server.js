// server.js
require("dotenv").config();
const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const { globalLimiter } = require("./middlewares/rateLimiter");
// Load .env config
dotenv.config();

// MongoDB connection
connectDB();

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = [
  process.env.PUBLIC_URL_LOCAL,
  process.env.ADMIN_URL_LOCAL,
  process.env.PUBLIC_URL_PROD,
  process.env.ADMIN_URL_PROD
];
// === CORS Setup ===
// app.use(cors({
//   origin: [process.env.FRONTEND_URL, process.env.PUBLIC_FRONTEND_URL, process.env.RATEPRO_URL],
//   credentials: true
// }));
app.use(cors({
  origin: function (origin, callback) {
    console.log('allowed Origins', allowedOrigins);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));



// === Body & Cookie Parsers ===
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(globalLimiter); // Applies to entire app


// === Static Folder for Assets (profile imgs, PDFs, QR etc.) ===
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// === Routes Placeholder ===
// All modular routes will be imported & registered here later
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

// app.use("/api/surveys", require("./routes/surveyRoutes"));
// app.use("/api/content", require("./routes/contentRoutes"));

// === Error Handling Middleware ===
const { notFound, errorHandler } = require("./middlewares/errorHandler");
app.use(notFound);
app.use(errorHandler);

// === Server Boot ===
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);
