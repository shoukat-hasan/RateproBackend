// const mongoose = require('mongoose');

// const customRoleSchema = new mongoose.Schema({
//   name: {
//     type: String,
//     required: [true, "Role name is required"],
//     trim: true,
//     unique: true, // Unique per tenant? Add compound index if needed
//   },
//   description: {
//     type: String,
//     default: "",
//   },
//   // Linked to Tenant (company)
//   tenant: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "Tenant",
//     required: true,
//   },
//   // Permissions linked (array of refs to Permission model)
//   permissions: [
//     {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Permission",
//     }
//   ],
//   isActive: {
//     type: Boolean,
//     default: true,
//   },
//   deleted: {
//     type: Boolean,
//     default: false,
//   },
// }, { timestamps: true });

// // Index for faster queries by tenant and name
// customRoleSchema.index({ tenant: 1, name: 1 }, { unique: true });

// module.exports = mongoose.model('CustomRole', customRoleSchema);
const mongoose = require('mongoose');

const customRoleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Role name is required"],
    trim: true,
  },
  description: {
    type: String,
    default: "",
  },
  // Linked to Tenant (company)
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    required: [true, "Tenant is required"],
  },
  // Permissions linked (array of refs to Permission model)
  permissions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Permission",
      validate: {
        validator: async function (id) {
          const permission = await mongoose.model('Permission').findById(id);
          return !!permission;
        },
        message: "Invalid permission ID",
      },
    }
  ],
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Track assigned users
  userCount: { type: Number, default: 0 }, // Store count of assigned users
  // Who created this role (companyAdmin)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "Creator is required"],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Index for faster queries by tenant and name (unique per tenant)
customRoleSchema.index({ tenant: 1, name: 1 }, { unique: true });

// Pre-validate hook to ensure tenant exists
customRoleSchema.pre('validate', async function (next) {
  if (this.tenant) {
    const tenant = await mongoose.model('Tenant').findById(this.tenant);
    if (!tenant) {
      return next(new Error("Invalid tenant ID"));
    }
  }
  next();
});

module.exports = mongoose.model('CustomRole', customRoleSchema);