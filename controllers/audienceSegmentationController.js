// controllers/audienceSegmentationController.js
const Segment = require("../models/AudienceSegmentation.js");
const ExcelJS = require('exceljs');
const PDFDocument = require("pdfkit");
const path = require('path');
const fs = require("fs");

// Get list of audience segments with pagination
exports.getSegments = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        // Step 1: Find segments ONLY for current tenant
        const segments = await Segment.find({ tenantId: req.tenantId })
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .sort({ created: -1 });

        // Step 2: Total count for this tenant
        const total = await Segment.countDocuments({ tenantId: req.tenantId });

        res.json({ success: true, segments, total });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getAllSegments = async (req, res) => {
    try {
        // Step 1: Only fetch segments for current tenant
        const segments = await Segment.find({ tenantId: req.tenantId }).sort({ created: -1 });

        res.json({ success: true, segments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Create a new audience segment
exports.createSegment = async (req, res) => {
    try {
        const { name, description, criteria, size, status } = req.body;

        const newSegment = new Segment({
            tenantId: req.tenantId,
            name,
            description,
            criteria,
            size,
            status
        });

        await newSegment.save();
        res.json({ success: true, segment: newSegment });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Update an existing audience segment
exports.updateSegment = async (req, res) => {
    try {
        // Step 1: First find the segment AND check tenant
        const segment = await Segment.findOne({
            _id: req.params.id,
            tenantId: req.tenantId,
        });

        if (!segment) {
            return res.status(404).json({
                success: false,
                message: "Segment not found or you don't have permission"
            });
        }

        // Step 2: Now update the allowed fields
        Object.assign(segment, req.body);
        await segment.save();

        res.json({ success: true, segment });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Delete an audience segment
exports.deleteSegment = async (req, res) => {
    try {
        // Step 1: Find with tenant filter
        const segment = await Segment.findOne({
            _id: req.params.id,
            tenantId: req.tenantId
        });

        if (!segment) {
            return res.status(404).json({
                success: false,
                message: "Segment not found or you don't have permission"
            });
        }

        // Step 2: Delete safely
        await segment.deleteOne();

        res.json({ success: true, message: "Segment deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Preview segment size based on criteria
exports.previewSegment = async (req, res) => {
    try {
        const { demographic, behavior, engagement, purchase } = req.body;

        // Dummy logic – replace with real DB query later
        const mockSize = Math.floor(Math.random() * 1500) + 100;

        res.json({
            success: true,
            preview: {
                estimatedSize: mockSize,
                filters: { demographic, behavior, engagement, purchase }
            }
        });

    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Export segment details to Excel
exports.exportSegmentExcel = async (req, res) => {
    try {
        // Step 1: Find segment by ID AND tenant
        const segment = await Segment.findOne({
            _id: req.params.id,
            tenantId: req.tenantId
        });

        if (!segment) {
            return res.status(404).json({
                success: false,
                message: "Segment not found or you don't have permission"
            });
        }

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Segment");

        sheet.addRow(["Field", "Value"]);
        sheet.addRow(["Name", segment.name]);
        sheet.addRow(["Description", segment.description]);
        sheet.addRow(["Criteria", segment.criteria]);
        sheet.addRow(["Size", segment.size]);
        sheet.addRow(["Status", segment.status]);
        sheet.addRow(["Created", segment.created]);

        // Set headers for browser download
        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=segment_${segment._id}.xlsx`
        );

        await workbook.xlsx.write(res); // write directly to response
        res.end();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Export segment details to PDF
exports.exportSegmentPDF = async (req, res) => {
    try {
        // Step 1: Find segment by ID AND tenant
        const segment = await Segment.findOne({
            _id: req.params.id,
            tenantId: req.tenantId
        });

        if (!segment) {
            return res.status(404).json({
                success: false,
                message: "Segment not found or you don't have permission"
            });
        }

        const doc = new PDFDocument();

        // Set headers for browser download
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=segment_${segment._id}.pdf`
        );

        doc.pipe(res); // send PDF directly to browser

        doc.fontSize(20).text("Segment Details", { underline: true });
        doc.moveDown();
        doc.fontSize(14).text(`Name: ${segment.name}`);
        doc.text(`Description: ${segment.description}`);
        doc.text(`Criteria: ${segment.criteria}`);
        doc.text(`Size: ${segment.size}`);
        doc.text(`Status: ${segment.status}`);
        doc.text(`Created: ${segment.created}`);

        doc.end();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};