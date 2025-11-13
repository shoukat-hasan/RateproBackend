// // models/Subscription.js
// const mongoose = require("mongoose");

// const subscriptionSchema = new mongoose.Schema(
//   {
//     user: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       required: true,
//     },
//     plan: {
//       type: String,
//       enum: ["free", "starter", "pro", "agency"],
//       default: "free",
//       required: true,
//     },
//     credits: {
//       type: Number,
//       default: 0, // har plan ke hisaab se assign hoga
//     },
//     price: {
//       type: Number,
//       default: 0, // agar Free hai to 0, warna plan ke hisaab se
//     },
//     startDate: {
//       type: Date,
//       default: Date.now,
//     },
//     endDate: {
//       type: Date,
//     },
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//     paymentId: {
//       type: String, // Stripe/PayPal payment reference
//     },
//     renewal: {
//       type: Boolean,
//       default: true, // auto-renewal option
//     },
//   },
//   { timestamps: true }
// );

// // Plan ke hisaab se credits aur price set karna
// subscriptionSchema.pre("save", function (next) {
//   if (this.isModified("plan")) {
//     switch (this.plan) {
//       case "free":
//         this.credits = 5;
//         this.price = 0;
//         this.endDate = null; // Free unlimited hai
//         break;
//       case "starter":
//         this.credits = 100;
//         this.price = 10; // $10 ya jo bhi tum set karo
//         this.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 din
//         break;
//       case "pro":
//         this.credits = 500;
//         this.price = 25;
//         this.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
//         break;
//       case "agency":
//         this.credits = 2000;
//         this.price = 99;
//         this.endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
//         break;
//     }
//   }
//   next();
// });

// module.exports = mongoose.model("Subscription", subscriptionSchema);

// models/Subscription.js
// const mongoose = require("mongoose");

// const subscriptionSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: true,
//       enum: ['free', 'starter', 'pro', 'agency', 'premium', 'enterprise']
//     },
//     price: {
//       type: Number,
//       required: true,
//       default: 0
//     },
//     credits: {
//       type: Number,
//       required: true,
//       default: 0
//     },
//     features: [{
//       type: String
//     }],
//     billingCycle: {
//       type: String,
//       enum: ['monthly', 'yearly'],
//       default: 'monthly'
//     },
//     isActive: {
//       type: Boolean,
//       default: true
//     },
//     description: {
//       type: String
//     }
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("Subscription", subscriptionSchema);
// models/Subscription.js
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true, default: 0 },
    credits: { type: Number, required: true, default: 0 },
    features: [{ type: String }],
    billingCycle: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    description: String,
    isActive: { type: Boolean, default: true },
    isTemplate: { type: Boolean, default: false }, // ✅ Admin plans vs Tenant copies

    // Tenant-level usage
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant" },
    planTemplate: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },

    // Subscription lifecycle
    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "pending"],
      default: "pending",
    },
    startDate: Date,
    endDate: Date,
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    activatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    activatedAt: Date,

    // Payment & metadata
    paymentDetails: { type: Object },
    cancellationReason: String,
    feedback: String,
    autoRenew: { type: Boolean, default: false },

    // Audit fields
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
