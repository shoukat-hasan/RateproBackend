// controllers/ticketController.js
const mongoose = require("mongoose");
const Ticket = require("../models/Ticket");
const User = require("../models/User");
const Tenant = require("../models/Tenant");
const cloudinary = require("../utils/cloudinary");
const sendEmail = require("../utils/sendEmail");
const Joi = require("joi");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Validation Schemas
const createTicketSchema = Joi.object({
    subject: Joi.string().min(5).max(200).required().messages({
        "string.min": "Subject must be at least 5 characters",
        "string.max": "Subject cannot exceed 200 characters",
        "any.required": "Subject is required",
    }),
    description: Joi.string().min(10).max(2000).required().messages({
        "string.min": "Description must be at least 10 characters",
        "string.max": "Description cannot exceed 2000 characters",
        "any.required": "Description is required",
    }),
    category: Joi.string().valid(
        "technical", "bug", "feature", "access", "training", "billing", "other"
    ).required().messages({
        "any.required": "Category is required",
        "any.only": "Invalid category selected",
    }),
    email: Joi.string().email().optional(),
});

const updateTicketSchema = Joi.object({
    subject: Joi.string().min(5).max(200).optional(),
    description: Joi.string().min(10).max(2000).optional(),
    category: Joi.string().valid(
        "technical", "bug", "feature", "access", "training", "billing", "other"
    ).optional(),
    status: Joi.string().valid("open", "in-progress", "resolved", "closed").optional(),
});

const querySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().allow("").optional(),
    status: Joi.string().valid("open", "in-progress", "resolved", "closed").allow("").optional(),
    category: Joi.string().allow("").optional(),
    sort: Joi.string().default("-createdAt"),
});

const idSchema = Joi.object({
    id: Joi.string().hex().length(24).required().messages({
        "string.hex": "Invalid ticket ID format",
        "string.length": "Invalid ticket ID length",
        "any.required": "Ticket ID is required",
    }),
});

const commentSchema = Joi.object({
    message: Joi.string().min(1).max(2000).required().messages({
        "string.empty": "Comment cannot be empty",
        "string.min": "Comment too short",
        "any.required": "Comment is required"
    }),
});

// ✅ Create Ticket
exports.createTicket = async (req, res, next) => {
    try {
        // Validate input
        const { error } = createTicketSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        const { subject, description, category, email } = req.body;
        const createdBy = req.user._id;
        const tenantId = req.user.tenant || req.tenantId;

        // Handle file attachments
        let attachments = [];
        if (req.files && req.files.length > 0) {
            try {
                for (const file of req.files) {
                    const result = await cloudinary.uploader.upload(file.path, {
                        folder: "ticket-attachments",
                        resource_type: "auto", // Support images, videos, and other files
                    });

                    attachments.push({
                        fileName: file.originalname,
                        fileUrl: result.secure_url,
                        fileType: file.mimetype,
                        fileSize: file.size,
                        cloudinaryId: result.public_id,
                    });

                    // Clean up local file
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                }
            } catch (uploadError) {
                console.error("❌ File upload error:", uploadError);
                // Clean up any uploaded files
                req.files.forEach(file => {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                    }
                });
                return res.status(500).json({
                    success: false,
                    message: "Failed to upload attachments"
                });
            }
        }

        // Create ticket
        const newTicket = await Ticket.create({
            subject,
            description,
            category,
            tenantId: tenantId,
            createdBy,
            attachments,
            contactEmail: email || req.user.email,
            lastUpdated: new Date(), // 👈 added here
        });

        // Populate created ticket with user details
        const populatedTicket = await Ticket.findById(newTicket._id)
            .populate("createdBy", "name email avatar")
            .populate("tenantId", "name domain");

        // Send notification email to admins (optional)
        try {
            const adminUsers = await User.find({
                role: { $in: ["admin", "companyAdmin"] },
                tenant: tenantId,
                isActive: true
            });

            if (adminUsers.length > 0) {
                const adminEmails = adminUsers.map(admin => admin.email);
                await sendEmail({
                    to: adminEmails,
                    subject: `New Support Ticket: ${subject}`,
                    html: `
            <h3>New Support Ticket Created</h3>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>Created by:</strong> ${req.user.name} (${req.user.email})</p>
            <p><strong>Description:</strong></p>
            <p>${description}</p>
            ${attachments.length > 0 ? `<p><strong>Attachments:</strong> ${attachments.length} file(s)</p>` : ''}
          `,
                });
            }
        } catch (emailError) {
            console.error("❌ Email notification error:", emailError);
            // Don't fail the request if email fails
        }

        res.status(201).json({
            success: true,
            message: "Ticket created successfully",
            data: populatedTicket,
        });
    } catch (error) {
        console.error("❌ Error creating ticket:", error);

        // Clean up files on error
        if (req.files) {
            req.files.forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }

        next(error);
    }
};

// ✅ Get All Tickets with Pagination and Filtering
exports.getTickets = async (req, res, next) => {
    try {
        // Validate query parameters
        const { error, value } = querySchema.validate(req.query);
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        const { page, limit, search, status, category, sort } = value;
        const tenantId = req.user.tenant || req.tenantId;

        // Build filter object
        let filter = {};

        // Role-based filtering
        if (req.user.role === "admin") {
            // Super admin can view all tickets
            filter = {};
        } else if (req.user.role === "companyAdmin") {
            // Company admin can view company tickets
            filter.tenantId = tenantId;
        } else {
            // Regular users can only see their own tickets
            filter.createdBy = req.user._id;
        }

        // Apply additional filters
        if (status) filter.status = status;
        if (category) filter.category = category;

        // Search functionality
        if (search) {
            filter.$or = [
                { subject: { $regex: search, $options: "i" } },
                { description: { $regex: search, $options: "i" } },
                { category: { $regex: search, $options: "i" } },
            ];
        }

        // Calculate pagination
        const skip = (page - 1) * limit;

        // Execute query with population
        const [tickets, totalCount] = await Promise.all([
            Ticket.find(filter)
                .populate("createdBy", "name email avatar")
                .populate("tenantId", "name domain")
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Ticket.countDocuments(filter)
        ]);

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / limit);
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        res.status(200).json({
            success: true,
            data: tickets,
            pagination: {
                currentPage: page,
                totalPages,
                totalCount,
                limit,
                hasNext,
                hasPrev,
            },
            filters: {
                search: search || null,
                status: status || null,
                category: category || null,
            }
        });
    } catch (error) {
        console.error("❌ Error fetching tickets:", error);
        next(error);
    }
};

// ✅ Get Single Ticket by ID
exports.getTicketById = async (req, res, next) => {
    try {
        // Validate ticket ID
        const { error } = idSchema.validate({ id: req.params.id });
        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            });
        }

        const ticketId = req.params.id;
        const tenantId = req.user.tenant?._id || req.user.tenant || req.tenantId;

        // Fetch the ticket
        const ticket = await Ticket.findById(ticketId)
            .populate("createdBy", "name email avatar phone")
            .populate("tenantId", "name domain address contactEmail contactPhone")
            .populate("comments.author", "name email role avatar")
            .lean();


        if (!ticket) {
            return res.status(404).json({ success: false, message: "Ticket not found" });
        }

        // Permission logic
        let hasAccess = false;

        if (req.user.role === "admin") {
            hasAccess = true;
        } else if (req.user.role === "companyAdmin") {
            hasAccess =
                ticket.tenantId?._id?.toString() === tenantId?.toString() ||
                ticket.createdBy?._id?.toString() === req.user._id?.toString();
        } else {
            hasAccess = ticket.createdBy?._id?.toString() === req.user._id?.toString();
        }

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You don't have permission to view this ticket."
            });
        }

        // Add meta info
        const ticketWithMeta = {
            ...ticket,
            isOwner: ticket.createdBy._id.toString() === req.user._id.toString(),
            canEdit:
                req.user.role === "admin" ||
                (req.user.role === "companyAdmin" &&
                    ticket.tenantId._id.toString() === tenantId.toString()) ||
                ticket.createdBy._id.toString() === req.user._id.toString(),
            canDelete:
                req.user.role === "admin" ||
                (req.user.role === "companyAdmin" &&
                    ticket.tenantId._id.toString() === tenantId.toString()),
            attachmentCount: ticket.attachments?.length || 0,
            daysSinceCreation: Math.floor(
                (new Date() - new Date(ticket.createdAt)) / (1000 * 60 * 60 * 24)
            )
        };

        res.status(200).json({
            success: true,
            data: ticketWithMeta
        });
    } catch (error) {
        console.error("❌ Error getting ticket:", error);
        next(error);
    }
};

// ✅ Update Ticket
exports.updateTicket = async (req, res, next) => {
    try {
        // Validate ticket ID
        const { error: idError } = idSchema.validate({ id: req.params.id });
        if (idError) {
            return res.status(400).json({
                success: false,
                message: idError.details[0].message
            });
        }

        // Validate update data
        const { error: updateError } = updateTicketSchema.validate(req.body);
        if (updateError) {
            return res.status(400).json({
                success: false,
                message: updateError.details[0].message
            });
        }

        const ticketId = req.params.id;
        const tenantId = req.user.tenant || req.tenantId;
        const updateData = req.body;

        // Find existing ticket
        const existingTicket = await Ticket.findById(ticketId);
        if (!existingTicket) {
            return res.status(404).json({
                success: false,
                message: "Ticket not found"
            });
        }

        // Permission check
        let canUpdate = false;
        if (req.user.role === "admin") {
            canUpdate = true;
        } else if (req.user.role === "companyAdmin") {
            canUpdate = existingTicket.tenantId.toString() === tenantId.toString();
        } else {
            // Regular users can only update their own tickets and only specific fields
            canUpdate = existingTicket.createdBy.toString() === req.user._id.toString();

            // Restrict what regular users can update
            if (canUpdate) {
                const allowedFields = ['subject', 'description', 'category'];
                const restrictedFields = Object.keys(updateData).filter(field => !allowedFields.includes(field));

                if (restrictedFields.length > 0) {
                    return res.status(403).json({
                        success: false,
                        message: `You can only update: ${allowedFields.join(', ')}`
                    });
                }
            }
        }

        if (!canUpdate) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You don't have permission to update this ticket."
            });
        }

        // Store old status for notification purposes
        const oldStatus = existingTicket.status;

        // Update ticket
        const updatedTicket = await Ticket.findByIdAndUpdate(
            ticketId,
            {
                ...updateData,
                updatedAt: new Date(),
                lastUpdated: new Date(), // 👈 added here
            },
            {
                new: true,
                runValidators: true
            }
        ).populate("comments.author", "name email role")
            .populate("tenantId", "name domain");

        // Send status change notification
        if (updateData.status && updateData.status !== oldStatus) {
            try {
                const statusChangeEmail = {
                    to: existingTicket.contactEmail || updatedTicket.createdBy.email,
                    subject: `Ticket Status Updated: ${updatedTicket.subject}`,
                    html: `
            <h3>Ticket Status Update</h3>
            <p><strong>Ticket:</strong> ${updatedTicket.subject}</p>
            <p><strong>Status changed from:</strong> ${oldStatus} → ${updateData.status}</p>
            <p><strong>Updated by:</strong> ${req.user.name}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            ${updateData.status === 'resolved' ? '<p>If you have any concerns, please let us know.</p>' : ''}
          `,
                };
                await sendEmail(statusChangeEmail);
            } catch (emailError) {
                console.error("❌ Status change email error:", emailError);
            }
        }

        res.status(200).json({
            success: true,
            message: `Ticket updated successfully`,
            data: updatedTicket,
        });
    } catch (error) {
        console.error("❌ Error updating ticket:", error);
        next(error);
    }
};

// ✅ Update Ticket Status (Separate endpoint for status-only updates)
exports.updateTicketStatus = async (req, res) => {
    try {
        const ticketId = req.params.id;
        const { status } = req.body;
        if (!status) {
            return res.status(400).json({ message: "Status is required" });
        }
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) return res.status(404).json({ message: "Ticket not found" });

        // Safely check tenantId
        const ticketTenantId = ticket.tenantId?.toString();
        const userTenantId = req.tenantId;
        // If responder is system admin → skip tenant check
        if (req.user.role !== 'admin') {  // "admin" here = system admin
            // Only do tenant validation for company members/admins
            if (!ticketTenantId || !userTenantId) {
                return res.status(400).json({ message: "Tenant info missing" });
            }
            if (ticketTenantId !== userTenantId) {
                return res.status(403).json({ message: "Access denied" });
            }
        }

        // Optional: normalize status
        const statusMap = {
            "Open": "open",
            "In Progress": "in-progress",
            "In-Progress": "in-progress",
            "Resolved": "resolved",
            "Closed": "closed",
        };
        ticket.status = statusMap[status] || status.toLowerCase().trim();
        await ticket.save();

        res.json({ success: true, ticket });
    } catch (error) {
        console.error("Update ticket status error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// ✅ Delete Ticket
// exports.deleteTicket = async (req, res, next) => {
//     try {
//         // Validate ticket ID
//         const { error } = idSchema.validate({ id: req.params.id });
//         if (error) {
//             return res.status(400).json({
//                 success: false,
//                 message: error.details[0].message
//             });
//         }

//         const ticketId = req.params.id;
//         const tenantId = req.user.tenant || req.tenantId;

//         // Find ticket
//         const ticket = await Ticket.findById(req.params.id);
//         if (!ticket) {
//             return res.status(404).json({
//                 success: false,
//                 message: "Ticket not found"
//             });
//         }

//         // Permission check
//         let canDelete = false;
//         if (req.user.role === "admin") {
//             canDelete = true;
//         } else if (req.user.role === "companyAdmin") {
//             canDelete = ticket.tenantId.toString() === tenantId.toString();
//         }
//         // Note: Regular users typically shouldn't be able to delete tickets

//         if (!canDelete) {
//             return res.status(403).json({
//                 success: false,
//                 message: "Access denied. You don't have permission to delete this ticket."
//             });
//         }

//         // Delete attachments from Cloudinary
//         if (ticket.attachments && ticket.attachments.length > 0) {
//             try {
//                 for (const attachment of ticket.attachments) {
//                     if (attachment.cloudinaryId) {
//                         await cloudinary.uploader.destroy(attachment.cloudinaryId);
//                     }
//                 }
//             } catch (cloudinaryError) {
//                 console.error("❌ Error deleting attachments from Cloudinary:", cloudinaryError);
//                 // Continue with ticket deletion even if file cleanup fails
//             }
//         }

//         // Delete ticket
//         await Ticket.findByIdAndDelete(ticketId);

//         // Send deletion notification to ticket creator
//         try {
//             const deletionEmail = {
//                 to: ticket.contactEmail,
//                 subject: `Ticket Deleted: ${ticket.subject}`,
//                 html: `
//           <h3>Ticket Deletion Notification</h3>
//           <p>Your support ticket has been deleted by an administrator.</p>
//           <p><strong>Ticket:</strong> ${ticket.subject}</p>
//           <p><strong>Deleted by:</strong> ${req.user.name}</p>
//           <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
//           <p>If you have any questions, please contact support.</p>
//         `,
//             };
//             await sendEmail(deletionEmail);
//         } catch (emailError) {
//             console.error("❌ Deletion email error:", emailError);
//         }

//         res.status(200).json({
//             success: true,
//             message: "Ticket deleted successfully"
//         });
//     } catch (error) {
//         console.error("❌ Error deleting ticket:", error);
//         next(error);
//     }
// };
exports.deleteTicket = async (req, res, next) => {
    try {
        // ✅ Step 1: Validate ID
        const { error } = idSchema.validate({ id: req.params.id });
        if (error) {
            console.warn("⚠️ ID validation failed:", error.details[0].message);
            return res.status(400).json({
                success: false,
                message: error.details[0].message,
            });
        }

        const ticketId = req.params.id;
        const tenantId = req.user.tenant?._id || req.tenantId;

        // ✅ Step 2: Find ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            console.warn("⚠️ Ticket not found:", ticketId);
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        // ✅ Step 3: Permission check
        let canDelete = false;
        if (req.user.role === "admin") {
            canDelete = true;
        } else if (req.user.role === "companyAdmin") {
            canDelete = ticket.tenantId?.toString() === tenantId?.toString();
        } else if (req.user.role === "user") {
            canDelete = ticket.createdBy?.toString() === req.user._id.toString();
        }

        if (!canDelete) {
            console.warn("🚫 Access denied for user:", req.user._id);
            return res.status(403).json({
                success: false,
                message:
                    "Access denied. You don't have permission to delete this ticket.",
            });
        }

        // ✅ Step 4: Delete attachments (if any)
        if (ticket.attachments?.length > 0) {
            try {
                for (const attachment of ticket.attachments) {
                    if (attachment.cloudinaryId) {
                        await cloudinary.uploader.destroy(attachment.cloudinaryId);
                    }
                }
            } catch (cloudinaryError) {
                console.error("❌ Error deleting attachments from Cloudinary:", cloudinaryError);
            }
        }
        // ✅ Step 5: Delete ticket
        await Ticket.findByIdAndDelete(ticketId);

        // ✅ Step 6: Send email notification
        try {
            const deletionEmail = {
                to: ticket.contactEmail,
                subject: `Ticket Deleted: ${ticket.subject}`,
                html: `
          <h3>Ticket Deletion Notification</h3>
          <p>Your support ticket has been deleted by an administrator.</p>
          <p><strong>Ticket:</strong> ${ticket.subject}</p>
          <p><strong>Deleted by:</strong> ${req.user.name}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
          <p>If you have any questions, please contact support.</p>
        `,
            };
            await sendEmail(deletionEmail);
        } catch (emailError) {
            console.error("❌ Error sending deletion email:", emailError);
        }

        // ✅ Step 7: Response to client
        res.status(200).json({
            success: true,
            message: "Ticket deleted successfully",
        });

    } catch (error) {
        console.error("❌ Unexpected error in deleteTicket:", error);
        next(error);
    }
};

// ✅ Get Ticket Statistics
exports.getTicketStats = async (req, res, next) => {
    try {
        const tenantId = req.user.tenant || req.tenantId;

        // Build base filter based on user role
        let baseFilter = {};
        if (req.user.role === "admin") {
            baseFilter = {};
        } else if (req.user.role === "companyAdmin") {
            baseFilter.tenantId = tenantId;
        } else {
            baseFilter.createdBy = req.user._id;
        }

        // Get various statistics
        const [
            totalTickets,
            openTickets,
            inProgressTickets,
            resolvedTickets,
            closedTickets,
            categoryStats,
            recentTickets
        ] = await Promise.all([
            Ticket.countDocuments(baseFilter),
            Ticket.countDocuments({ ...baseFilter, status: "open" }),
            Ticket.countDocuments({ ...baseFilter, status: "in-progress" }),
            Ticket.countDocuments({ ...baseFilter, status: "resolved" }),
            Ticket.countDocuments({ ...baseFilter, status: "closed" }),

            // Category breakdown
            Ticket.aggregate([
                { $match: baseFilter },
                { $group: { _id: "$category", count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),

            // Recent tickets
            Ticket.find(baseFilter)
                .populate("createdBy", "name email")
                .sort({ createdAt: -1 })
                .limit(5)
                .lean()
        ]);

        // Calculate resolution rate
        const totalNonClosed = totalTickets - closedTickets;
        const resolutionRate = totalNonClosed > 0 ? (resolvedTickets / totalNonClosed * 100).toFixed(2) : 0;

        const stats = {
            total: totalTickets,
            byStatus: {
                open: openTickets,
                inProgress: inProgressTickets,
                resolved: resolvedTickets,
                closed: closedTickets,
            },
            byCategory: categoryStats.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            resolutionRate: parseFloat(resolutionRate),
            recentTickets: recentTickets,
        };

        res.status(200).json({
            success: true,
            data: stats,
        });
    } catch (error) {
        console.error("❌ Error getting ticket stats:", error);
        next(error);
    }
};

// ✅ Add Comment to Ticket
exports.addComment = async (req, res) => {
    try {
        // Validate message
        const { error } = commentSchema.validate(req.body);
        if (error) {
            console.warn("⚠️ [addComment] Validation error:", error.details[0].message);
            return res.status(400).json({ success: false, message: error.details[0].message });
        }

        const ticketId = req.params.id;
        const { message } = req.body;

        // Find ticket
        const ticket = await Ticket.findById(ticketId);
        if (!ticket) {
            console.warn("⚠️ [addComment] Ticket not found for ID:", ticketId);
            return res.status(404).json({ success: false, message: "Ticket not found" });
        }

        // Permission check
        const tenantId = req.user.tenant || req.tenantId;
        const isAdmin = req.user.role === "admin";
        const isCompanyAdmin = req.user.role === "companyAdmin";
        const isCreator = ticket.createdBy.toString() === req.user._id.toString();

        if (
            !isAdmin &&
            !(isCompanyAdmin && ticket.tenantId.toString() === tenantId?._id?.toString()) &&
            !isCreator
        ) {
            console.warn("🚫 [addComment] Access denied for user:", req.user._id);
            return res.status(403).json({
                success: false,
                message: "Access denied. You can't comment on this ticket.",
            });
        }

        // Create new comment
        const newComment = {
            id: uuidv4(),
            author: req.user._id.toString(),
            role: req.user.role,
            message,
            timestamp: new Date(),
        };

        // Push comment
        ticket.comments.push(newComment);
        ticket.lastUpdated = new Date();
        await ticket.save();

        res.status(201).json({
            success: true,
            message: "Comment added successfully",
            data: newComment,
        });
    } catch (error) {
        console.error("❌ [addComment] Error adding comment:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};

// ✅ Get All Comments for a Ticket
exports.getComments = async (req, res) => {
    try {
        F
        const ticket = await Ticket.findById(req.params.id)
            .populate("comments.author", "name email role")
            .lean();

        if (!ticket)
            return res.status(404).json({ success: false, message: "Ticket not found" });

        const comments = ticket.comments.sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp) // newest on top
        );

        res.status(200).json({ success: true, data: comments });
    } catch (error) {
        console.error("❌ Error getting comments:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};