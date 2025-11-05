// controllers/userCategoryController.js
const UserCategory = require('../models/UserCategory');
const Joi = require('joi');

// Joi Validation Schemas
const createSchema = Joi.object({
    name: Joi.string().min(2).max(50).required(),
    type: Joi.string().valid('internal', 'external').default('internal'),
    description: Joi.string().allow('', null),
});

const updateSchema = Joi.object({
    name: Joi.string().min(2).max(50),
    type: Joi.string().valid('internal', 'external'),
    active: Joi.boolean(),
    description: Joi.string().allow('', null),
});

// 🔹 CREATE
exports.createCategory = async (req, res) => {
    try {
        if (!req.user || !req.tenantId)
            return res.status(400).json({ message: "Invalid request context" });

        const { error, value } = createSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        if (!['admin', 'companyAdmin'].includes(req.user.role))
            return res.status(403).json({ message: 'Access denied' });

        const exists = await UserCategory.findOne({
            tenant: req.tenantId,
            name: value.name,
        });
        if (exists) return res.status(400).json({ message: 'Category already exists in this company' });

        const category = await UserCategory.create({
            ...value,
            tenant: req.tenantId,
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, data: { category } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// 🔹 READ (All tenant categories)
exports.getCategories = async (req, res) => {
    try {
        const filter = {
            $or: [
                { isDefault: true },           // global defaults
                { tenant: req.tenantId },      // tenant’s own
            ],
            active: true,
        };

        const categories = await UserCategory.find(filter)
            .select("name type active isDefault createdAt")
            .sort({ isDefault: -1, name: 1 }); // show defaults first

        res.json({ success: true, count: categories.length, data: { categories } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// 🔹 UPDATE
exports.updateCategory = async (req, res) => {
    try {
        const { error, value } = updateSchema.validate(req.body);
        if (error) return res.status(400).json({ message: error.details[0].message });

        if (!["admin", "companyAdmin"].includes(req.user.role))
            return res.status(403).json({ message: "Access denied" });

        // 🔒 Prevent editing default categories
        const target = await UserCategory.findById(req.params.id);
        if (!target) return res.status(404).json({ message: "Category not found" });
        if (target.isDefault)
            return res.status(400).json({ message: "Default categories cannot be modified" });

        // ✅ Update allowed only on tenant’s own categories
        const category = await UserCategory.findOneAndUpdate(
            { _id: req.params.id, tenant: req.tenantId },
            { $set: value },
            { new: true, runValidators: true }
        );

        res.json({ success: true, data: { category } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// 🔹 SOFT DELETE (Deactivate)
exports.deleteCategory = async (req, res) => {
    try {
        if (!["admin", "companyAdmin"].includes(req.user.role))
            return res.status(403).json({ message: "Access denied" });

        const target = await UserCategory.findById(req.params.id);
        if (!target) return res.status(404).json({ message: "Category not found" });
        if (target.isDefault)
            return res.status(400).json({ message: "Default categories cannot be deleted" });

        const category = await UserCategory.findOneAndUpdate(
            { _id: req.params.id, tenant: req.tenantId },
            { $set: { active: false } },
            { new: true }
        );

        res.json({ success: true, message: "Category deactivated", data: { category } });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};
