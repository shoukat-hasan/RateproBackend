// const mongoose = require("mongoose");

// const departmentSchema = new mongoose.Schema(
//   {
//     name: {
//       type: String,
//       required: [true, "Department name is required"],
//       trim: true,
//     },

//     // Parent Company / Tenant
//     tenant: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Tenant",
//       required: true,
//     },

//     // Department Head (optional)
//     head: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "User",
//       default: null,
//     },

//     // Members of this department (optional, can also be derived from User.department)
//     members: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "User",
//       },
//     ],

//     // Status
//     isActive: {
//       type: Boolean,
//       default: true,
//     },
//     deleted: {
//       type: Boolean,
//       default: false,
//     },
//   },
//   { timestamps: true }
// );

// // Indexes for performance
// departmentSchema.index({ name: 1 });
// departmentSchema.index({ tenant: 1 });

// module.exports = mongoose.model("Department", departmentSchema);

const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  // Linked to Tenant
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: true,
  },
  name: { type: String, required: true },
  
  head: { 
    type: String, // Changed to String for manual name input
    default: "",
  },
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
// head: { 
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "User", // Member as head
  // },