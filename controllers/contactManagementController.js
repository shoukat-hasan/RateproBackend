// controllers/contactManagementController.js
const Contact = require("../models/ContactManagement");
const AudienceSegment = require("../models/AudienceSegmentation");
const ExcelJS = require('exceljs');
const PDFDocument = require("pdfkit");
const path = require('path');
const fs = require("fs");
const XLSX = require('xlsx');
const Logger = require("../utils/auditLog");

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

// Bulk create contacts from Excel
exports.bulkCreateContacts = async (req, res) => {
    try {
        const currentUser = req.user;
        
        // Role check
        if (currentUser.role !== 'companyAdmin') {
            return res.status(403).json({ message: 'Access denied: Only CompanyAdmin can perform bulk upload' });
        }

        // File check
        if (!req.file) {
            return res.status(400).json({ message: 'No Excel file uploaded' });
        }

        // Read Excel
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });

        if (rows.length < 2) {
            return res.status(400).json({ message: 'Empty or invalid Excel file. Must have at least one data row.' });
        }

        const dataRows = rows.slice(1);
        const tenantId = currentUser.tenant._id ? currentUser.tenant._id.toString() : currentUser.tenant;

        const successes = [];
        const errors = [];

        for (let i = 0; i < dataRows.length; i++) {
            const row = dataRows[i];
            const [name, email, phone, company, segmentName, tags, statusStr] = row.map(
                val => val?.toString().trim() || ''
            );

            if (!name || !email) {
                errors.push({ row: row.join(','), message: 'Name and Email are required' });
                continue;
            }

            // Segment check / create
            let segmentDoc = null;

            if (segmentName) {
                segmentDoc = await AudienceSegment.findOne({ tenantId, name: segmentName });
                if (!segmentDoc) {
                    console.log(`⚠️ Segment "${segmentName}" not found for email ${email}. Contact created without segment.`);
                } else {
                    segmentDoc.size += 1;
                    await segmentDoc.save();
                }
            }

            // Check duplicate email
            const existingContact = await Contact.findOne({ email, tenantId });
            if (existingContact) {
                errors.push({ email, message: 'Contact already exists with this email' });
                continue;
            }

            // Create contact
            const newContact = await Contact.create({
                tenantId,
                name,
                email,
                phone,
                company,
                segment: segmentDoc ? segmentDoc._id : null,
                tags,
                status: statusStr || 'Active',
                lastActivity: new Date(),
            });

            successes.push({ id: newContact._id, email: newContact.email });
        }

        // Logging
        await Logger.info({
            user: currentUser._id,
            action: "Bulk Create Contacts",
            status: "Success",
            details: `Processed: ${dataRows.length}, Success: ${successes.length}, Failed: ${errors.length}`
        });

        res.status(201).json({
            message: 'Bulk contact creation completed',
            totalProcessed: dataRows.length,
            successful: successes.length,
            failed: errors.length,
            createdContacts: successes,
            errors: errors.length > 0 ? errors : null,
        });

    } catch (err) {
        console.error("❌ BulkCreateContacts error:", err);

        await Logger.error({
            user: req.user?._id,
            action: "Bulk Create Contacts",
            status: "Failed",
            details: err.message,
        });

        res.status(500).json({ message: 'Internal Server Error', error: err.message });
    }
};

// POST /api/contacts
exports.createContact = async (req, res) => {
    try {
        const { name, email, phone, company, segment, tags, status } = req.body;

        let segmentId = null;
        if (segment) {
            segmentId = typeof segment === "string" ? segment : segment._id;
        }

        if (segmentId) {
            segmentDoc = await AudienceSegment.findOne({
                _id: segmentId,
                tenantId: req.tenantId
            });
            if (!segmentDoc) {
                return res.status(403).json({
                    message: "Invalid segment or you don't have permission"
                });
            }
            segmentDoc.size += 1;
            await segmentDoc.save();

        } else {
            console.log("ℹ️ No segment provided, proceeding without segment");
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
        console.error("❌ Error creating contact:", err);
        res.status(500).json({ message: err.message });
    }
};

// PUT /api/contacts/:id
exports.updateContact = async (req, res) => {
    try {
        const { name, email, phone, company, segment, tags, status } = req.body;

        let contact = await Contact.findOne({
            _id: req.params.id,
            tenantId: req.tenantId
        }).populate('segment');

        if (!contact) {
            return res.status(404).json({ message: "Contact not found" });
        }

        const oldSegmentId = contact.segment?._id?.toString() || null;

        // ← YEH SABSE STRONG FIX HAI (string, object, mongoose doc – sab handle karega)
        let newSegmentId = null;
        if (segment) {
            if (typeof segment === 'string' && segment.trim() !== '') {
                newSegmentId = segment.trim();
            }
            else if (segment && segment._id) {
                newSegmentId = segment._id.toString();
            }
            else if (segment && segment.id) {
                newSegmentId = segment.id.toString();
            }
        }

        // Agar segment change hua hai
        if (oldSegmentId !== newSegmentId) {

            // Purana segment size ghataye
            if (oldSegmentId) {
                await AudienceSegment.updateOne(
                    { _id: oldSegmentId, tenantId: req.tenantId },
                    { $inc: { size: -1 } }
                );
            }

            // Naya segment size badhaye + valid hai ya nahi check
            if (newSegmentId) {
                const segmentDoc = await AudienceSegment.findOne({
                    _id: newSegmentId,
                    tenantId: req.tenantId
                });

                if (!segmentDoc) {
                    return res.status(400).json({
                        message: "Segment not found ya aapka tenant ka nahi hai!"
                    });
                }

                await AudienceSegment.updateOne(
                    { _id: newSegmentId },
                    { $inc: { size: 1 } }
                );

                contact.segment = newSegmentId; // ← yeh line important hai
            } else {
                contact.segment = null;
            }
        }

        // Baaki fields
        if (name !== undefined) contact.name = name;
        if (email !== undefined) contact.email = email;
        if (phone !== undefined) contact.phone = phone;
        if (company !== undefined) contact.company = company;
        if (tags !== undefined) contact.tags = tags;
        if (status !== undefined) contact.status = status;

        contact.lastActivity = new Date();
        await contact.save();

        // Final populated response
        const finalContact = await Contact.findById(contact._id)
            .populate('segment', 'name size');

        res.json(finalContact);

    } catch (err) {
        console.error(err);
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