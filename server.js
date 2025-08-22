// // server.js
// require("dotenv").config();
// const express = require("express");
// const dotenv = require("dotenv");
// const connectDB = require("./config/db");
// const cookieParser = require("cookie-parser");
// const cors = require("cors");
// const path = require("path");
// const { globalLimiter } = require("./middlewares/rateLimiter");
// // Load .env config
// dotenv.config();
// require("./config/passportConfig");
// const seedPermissions = require("./seeds/seedPermissions");

// // MongoDB connection
// connectDB();

// const app = express();

// app.set("trust proxy", 1);

// // const allowedOrigins = [
// //   process.env.PUBLIC_URL_LOCAL,
// //   process.env.ADMIN_URL_LOCAL,
// //   process.env.PUBLIC_URL_PROD,
// //   process.env.ADMIN_URL_PROD,
// // ];
// // === CORS Setup ===
// // app.use(cors({
// //   origin: [process.env.FRONTEND_URL, process.env.PUBLIC_FRONTEND_URL, process.env.RATEPRO_URL],
// //   credentials: true
// // }));
// // app.use(cors({
// //   origin: function (origin, callback) {
// //     console.log('allowed Origins', allowedOrigins);
// //     if (!origin || allowedOrigins.includes(origin)) {
// //       callback(null, true);
// //     } else {
// //       callback(new Error("Not allowed by CORS"));
// //     }
// //   },
// //   credentials: true,
// // }));
// const allowedOrigins = [
//   "http://localhost:5173",
//   "http://localhost:5174",
//   "http://192.168.0.3:5173",
//   "https://rate-pro-admin.vercel.app",
//   "https://ratepro-public.vercel.app"
// ];

// // === Body & Cookie Parsers ===
// app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// app.use(cookieParser());
// app.use(globalLimiter); // Applies to entire app

// app.use(
//   cors({
//     origin: function (origin, callback) {
//       // allow requests with no origin (like mobile apps, curl, Postman)
//       if (!origin || allowedOrigins.includes(origin)) {
//         callback(null, true);
//       } else {
//         callback(new Error("Not allowed by CORS"));
//       }
//     },
//     credentials: true, // allow cookies, auth headers
//   })
// );

// // app.get("/api/debug-cookies", (req, res) => {
// //   console.log("🍪 Cookies from browser:", req.cookies);
// //   res.json({ cookies: req.cookies });
// // });


// // === Static Folder for Assets (profile imgs, PDFs, QR etc.) ===
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// // === Routes Placeholder ===
// // All modular routes will be imported & registered here later
// app.use("/api/auth", require("./routes/authRoutes"));
// app.use("/api/users", require("./routes/userRoutes"));
// app.use("/api/surveys", require("./routes/surveyRoutes"));
// // app.use("/api/content", require("./routes/contentRoutes"));

// // === Error Handling Middleware ===
// const { notFound, errorHandler } = require("./middlewares/errorHandler");
// app.use(notFound);
// app.use(errorHandler);

// // === Server Boot ===
// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () =>
//   console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
// );
require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const { globalLimiter } = require("./middlewares/rateLimiter");
const seedPermissions = require("./seeds/seedPermissions");

// MongoDB connection and seeding
const startServer = async () => {
  try {
    await connectDB();
    await seedPermissions(); // Run permission seeding after DB connection
    // console.log("Initial setup completed (database and permissions seeded)");
  } catch (err) {
    console.error("Server startup error:", err);
    process.exit(1);
  }
};

startServer();

const app = express();

app.set("trust proxy", 1);

// CORS allowed origins
const allowedOrigins = [
  process.env.PUBLIC_URL_LOCAL || "http://localhost:5173",
  process.env.ADMIN_URL_LOCAL || "http://localhost:5174",
  process.env.PUBLIC_URL_PROD || "https://ratepro-public.vercel.app",
  process.env.ADMIN_URL_PROD || "https://rate-pro-admin.vercel.app",
  "http://192.168.0.3:5173", // Local IP for testing
];

// Middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(globalLimiter);

// Static folder for uploads (avatars, PDFs, etc.)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use('/api/tenants', require("./routes/tenantRoutes"));
app.use("/api/roles", require("./routes/roleRoutes"));
app.use("/api/permissions", require("./routes/permissionRoutes.js"));
app.use("/api/surveys", require("./routes/surveyRoutes"));

// Error Handling Middleware
const { notFound, errorHandler } = require("./middlewares/errorHandler");
app.use(notFound);
app.use(errorHandler);

// Server Boot
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
);