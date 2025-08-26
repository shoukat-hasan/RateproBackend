const mongoose = require("mongoose");
const Permission = require("../models/Permission");

const permissions = [
    // User
    { name: "user:create", description: "Create new users", group: "user" },
    { name: "user:read", description: "View user details", group: "user" },
    { name: "user:update", description: "Update user details", group: "user" },
    { name: "user:delete", description: "Delete users", group: "user" },
    { name: "user:toggle", description: "Toggle user active status", group: "user" },
    { name: "user:export", description: "Export user data as PDF", group: "user" },
    { name: "user:notify", description: "Send notifications to users", group: "user" },
    // Role
    { name: "role:create", description: "Create custom roles", group: "role" },
    { name: "role:read", description: "View custom roles", group: "role" },
    { name: "role:update", description: "Update custom roles", group: "role" },
    { name: "role:delete", description: "Delete custom roles", group: "role" },
    { name: "role:assign", description: "Assign roles to users", group: "role" },
    { name: "role:remove", description: "Remove roles to users", group: "role" },
    { name: 'permission:assign', description: 'Assign permissions to users' },
    { name: 'permission:read', description: 'Read permission assignments' },
    // Survey
    { name: "survey:read", description: "View all surveys", group: "survey" },
    { name: "survey:create", description: "Create new surveys", group: "survey" },
    { name: "survey:templates", description: "Access survey templates", group: "survey" },
    { name: "survey:schedule", description: "Manage survey scheduling", group: "survey" },
    { name: "survey:responses:view", description: "View survey responses", group: "survey" },
    { name: "survey:analytics:view", description: "View survey analytics", group: "survey" },
    { name: "survey:customize", description: "Customize survey appearance", group: "survey" },
    { name: "survey:share", description: "Share surveys with others", group: "survey" },
    { name: "survey:settings:update", description: "Update survey settings", group: "survey" },
    { name: "survey:detail:view", description: "View survey details", group: "survey" },
    // Analytics Permissions
    { name: "analytics:view", description: "Access analytics overview dashboard", group: "analytics" },
    { name: "analytics:realtime", description: "View real-time survey results", group: "analytics" },
    { name: "analytics:trends", description: "Analyze survey response trends", group: "analytics" },
    { name: "analytics:custom", description: "Generate and view custom reports", group: "analytics" },
    { name: "analytics:responses", description: "View survey response overview", group: "analytics" },
    // Audience Management
    { name: "audience:view", description: "View all audiences list", group: "audience" },
    { name: "audience:segment", description: "Manage audience segmentation", group: "audience" },
    { name: "audience:contacts", description: "Manage audience contacts", group: "audience" },
    // Content Management
    { name: "content:features", description: "Manage platform features", group: "content" },
    { name: "content:pricing", description: "Manage pricing content", group: "content" },
    { name: "content:testimonials", description: "Manage testimonials", group: "content" },
    { name: "content:widgets", description: "Manage widgets and add-ons", group: "content" },
    // Support
    { name: "support:tickets", description: "Access and manage support tickets", group: "support" },
    // Settings
    { name: "settings:general", description: "Manage general system settings", group: "settings" },
    { name: "settings:email-templates", description: "Manage email templates", group: "settings" },
    { name: "settings:notifications", description: "Manage notification settings", group: "settings" },
    { name: "settings:smtp", description: "Configure SMTP server", group: "settings" },
    { name: "settings:thank-you-page", description: "Customize thank you page", group: "settings" },
    { name: "settings:theme", description: "Customize theme settings", group: "settings" },
];

const seedPermissions = async () => {
    try {
        for (const perm of permissions) {
            const existingPermission = await Permission.findOne({ name: perm.name });
            if (!existingPermission) {
                await Permission.create({
                    name: perm.name,
                    description: perm.description || `Permission to ${perm.name.split(":")[1]} ${perm.name.split(":")[0]}s`,
                    group: perm.group || null,
                });
            } else {
                // Update existing permission to add group if missing
                await Permission.updateOne(
                    { name: perm.name },
                    { $set: { group: perm.group || null } }
                );
            }
        }
        // console.log("Permissions seeded successfully");
    } catch (err) {
        console.error("Error seeding permissions:", err);
        throw err;
    }
};

module.exports = seedPermissions;