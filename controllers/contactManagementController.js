// controllers/contactManagementController.js
const Contact = require("../models/ContactManagement");
const AudienceSegment = require("../models/AudienceSegmentation");
const ExcelJS = require('exceljs');
const PDFDocument = require("pdfkit");
const path = require('path');
const fs = require("fs");

// GET /api/contacts
exports.getContacts = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = "", segment, status } = req.query;

        // ALWAYS restrict to tenant
        let filter = { tenantId: req.tenantId };

        // Search filter
        if (search) {
            const regex = new RegExp(search, "i");
            filter.$or = [
                { name: regex },
                { email: regex },
                { company: regex }
            ];
        }

        // Segment filter
        if (segment) {
            const seg = await AudienceSegment.findOne({
                name: segment,
                tenantId: req.tenantId   // segment must also belong to same tenant
            });

            if (seg) filter.segment = seg._id;
        }

        // Status filter
        if (status) {
            filter.status = new RegExp(status, "i");
        }

        // Query contacts with tenant filter
        const total = await Contact.countDocuments(filter);

        const contacts = await Contact.find(filter)
            .populate("segment", "name")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(Number(limit));

        res.json({
            contacts,
            total,
            page: Number(page),
            limit: Number(limit),
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// GET /api/contacts/:id
exports.getContactById = async (req, res) => {
    try {
        const contact = await Contact.findOne({
            _id: req.params.id,
            tenantId: req.tenantId
        }).populate("segment", "name");

        if (!contact) {
            return res.status(404).json({
                message: "Contact not found or you don't have permission"
            });
        }

        res.json(contact);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// POST /api/contacts
exports.createContact = async (req, res) => {
    try {
        const { name, email, phone, company, segment, tags, status } = req.body;

        let segmentDoc = null;

        // Segment check with tenant protection
        if (segment && segment._id) {
            segmentDoc = await AudienceSegment.findOne({
                _id: segment._id,
                tenantId: req.tenantId
            });

            if (!segmentDoc) {
                return res.status(403).json({
                    message: "Invalid segment or you don't have permission"
                });
            }

            // Increase segment size
            segmentDoc.size += 1;
            await segmentDoc.save();
        }

        // Create contact with tenantId
        const newContact = await Contact.create({
            tenantId: req.tenantId,      // IMPORTANT
            name,
            email,
            phone,
            company,
            segment: segmentDoc ? segmentDoc._id : null,
            tags,
            status: status || "Active",
            lastActivity: new Date(),
        });

        const contactWithSegment = await Contact.findOne({
            _id: newContact._id,
            tenantId: req.tenantId
        }).populate("segment", "name");

        res.status(201).json(contactWithSegment);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// PUT /api/contacts/:id
exports.updateContact = async (req, res) => {
    try {
        const { name, email, phone, company, segment, tags, status } = req.body;

        // Contact must belong to same tenant
        let contact = await Contact.findOne({
            _id: req.params.id,
            tenantId: req.tenantId
        });

        if (!contact) {
            return res.status(404).json({
                message: "Contact not found or you don't have permission"
            });
        }

        const oldSegmentId = contact.segment?.toString() || null;
        const newSegmentId = segment?._id || null;

        /** CASE 1: Segment changed */
        if (oldSegmentId !== newSegmentId) {

            // Decrease old segment size (only if belongs to this tenant)
            if (oldSegmentId) {
                await AudienceSegment.findOneAndUpdate(
                    { _id: oldSegmentId, tenantId: req.tenantId },
                    { $inc: { size: -1 } }
                );
            }

            // Increase new segment size (must belong to this tenant)
            if (newSegmentId) {

                const newSegmentDoc = await AudienceSegment.findOne({
                    _id: newSegmentId,
                    tenantId: req.tenantId
                });

                if (!newSegmentDoc) {
                    return res.status(403).json({
                        message: "Invalid segment or you don't have permission"
                    });
                }

                await AudienceSegment.findByIdAndUpdate(
                    newSegmentId,
                    { $inc: { size: 1 } }
                );
            }

            contact.segment = newSegmentId;
        }

        /** NORMAL FIELD UPDATES */
        contact.name = name ?? contact.name;
        contact.email = email ?? contact.email;
        contact.phone = phone ?? contact.phone;
        contact.company = company ?? contact.company;
        contact.tags = tags ?? contact.tags;
        contact.status = status ?? contact.status;
        contact.lastActivity = new Date();

        await contact.save();

        const updatedContact = await Contact.findOne({
            _id: contact._id,
            tenantId: req.tenantId
        }).populate("segment", "name size");

        res.json(updatedContact);

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// DELETE /api/contacts/:id
exports.deleteContact = async (req, res) => {
    try {
        const contact = await Contact.findOne({
            _id: req.params.id,
            tenantId: req.tenantId // 🔥 Tenant boundary
        });

        if (!contact) return res.status(404).json({ message: "Contact not found" });

        // Reduce segment count only in same tenant
        if (contact.segment) {
            await AudienceSegment.findOneAndUpdate(
                { _id: contact.segment, tenantId: req.tenantId },
                { $inc: { size: -1 } }
            );
        }

        await Contact.deleteOne({ _id: req.params.id, tenantId: req.tenantId });

        res.json({ message: "Contact deleted successfully" });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Export contacts to Excel
exports.exportContactsExcel = async (req, res) => {
    try {
        const contacts = await Contact.find({ tenantId: req.tenantId })
            .populate("segment", "name");

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Contacts");

        sheet.addRow(["Name", "Email", "Phone", "Company", "Segment", "Tags", "Status", "Last Activity"]);

        contacts.forEach((c) => {
            sheet.addRow([
                c.name,
                c.email,
                c.phone,
                c.company,
                c.segment ? c.segment.name : "",
                c.tags.join(", "),
                c.status,
                c.lastActivity?.toISOString().split("T")[0] || "",
            ]);
        });

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", "attachment; filename=contacts.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// Export contacts to PDF
exports.exportContactsPDF = async (req, res) => {
    try {
        const contacts = await Contact.find({ tenantId: req.tenantId })
            .populate("segment", "name");

        const doc = new PDFDocument({ margin: 30, size: "A4" });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "attachment; filename=contacts.pdf");

        doc.pipe(res);

        doc.fontSize(18).text("Contacts List", { align: "center" });
        doc.moveDown();

        contacts.forEach((c, index) => {
            doc.fontSize(12).text(
                `${index + 1}. ${c.name} | ${c.email} | ${c.phone} | ${c.company} | ${c.segment ? c.segment.name : ""} | ${c.tags.join(", ")} | ${c.status} | ${c.lastActivity?.toISOString().split("T")[0] || ""}`
            );
            doc.moveDown(0.5);
        });

        doc.end();
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};