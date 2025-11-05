// controllers/emailTemplateController.js
const EmailTemplate = require("../models/EmailTemplate");

// CREATE template
exports.createTemplate = async (req, res) => {
    try {
        const { name, subject, body, variables, description } = req.body;

        // Check if template name already exists
        const existingTemplate = await EmailTemplate.findOne({ name });
        if (existingTemplate) {
            return res.status(400).json({
                message: "Template name already exists"
            });
        }

        const template = new EmailTemplate({
            name,
            subject,
            body,
            variables: variables || [],
            description,
            isActive: true
        });

        await template.save();
        res.status(201).json({
            success: true,
            message: "Template created successfully",
            data: template
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// READ ALL templates with counts
exports.getTemplates = async (req, res) => {
    try {
        const { isActive } = req.query;
        let filter = {};

        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        const templates = await EmailTemplate.find(filter).sort({ createdAt: -1 });

        // Get counts
        const totalCount = await EmailTemplate.countDocuments();
        const activeCount = await EmailTemplate.countDocuments({ isActive: true });
        const inactiveCount = await EmailTemplate.countDocuments({ isActive: false });

        res.json({
            success: true,
            data: templates,
            counts: {
                total: totalCount,
                active: activeCount,
                inactive: inactiveCount
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// READ ONE template
exports.getTemplateById = async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        res.json({
            success: true,
            data: template
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// UPDATE template
exports.updateTemplate = async (req, res) => {
    try {
        const { name, subject, body, variables, description, isActive } = req.body;

        const template = await EmailTemplate.findById(req.params.id);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        // Check if name already exists (excluding current template)
        if (name && name !== template.name) {
            const existingTemplate = await EmailTemplate.findOne({ name });
            if (existingTemplate) {
                return res.status(400).json({
                    message: "Template name already exists"
                });
            }
        }

        const updateData = {
            name: name || template.name,
            subject: subject || template.subject,
            body: body || template.body,
            variables: variables || template.variables,
            description: description || template.description,
            isActive: isActive !== undefined ? isActive : template.isActive
        };

        const updatedTemplate = await EmailTemplate.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: "Template updated successfully",
            data: updatedTemplate
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// DELETE template
exports.deleteTemplate = async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        await EmailTemplate.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: "Template deleted successfully"
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// TOGGLE template status
exports.toggleTemplateStatus = async (req, res) => {
    try {
        const template = await EmailTemplate.findById(req.params.id);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: "Template not found"
            });
        }

        template.isActive = !template.isActive;
        await template.save();

        res.json({
            success: true,
            message: `Template ${template.isActive ? 'activated' : 'deactivated'} successfully`,
            data: template
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};