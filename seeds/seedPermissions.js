const mongoose = require("mongoose");
const Permission = require("../models/Permission");

const permissions = [
    { name: "user:create", description: "Create new users", group: "user" },
    { name: "user:read", description: "View user details", group: "user" },
    { name: "user:update", description: "Update user details", group: "user" },
    { name: "user:delete", description: "Delete users", group: "user" },
    { name: "user:toggle", description: "Toggle user active status", group: "user" },
    { name: "user:export", description: "Export user data as PDF", group: "user" },
    { name: "user:notify", description: "Send notifications to users", group: "user" },
    { name: "role:create", description: "Create custom roles", group: "role" },
    { name: "role:read", description: "View custom roles", group: "role" },
    { name: "role:update", description: "Update custom roles", group: "role" },
    { name: "role:delete", description: "Delete custom roles", group: "role" },
    { name: "role:assign", description: "Assign roles to users", group: "role" },
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
        console.log("Permissions seeded successfully");
    } catch (err) {
        console.error("Error seeding permissions:", err);
        throw err;
    }
};

module.exports = seedPermissions;