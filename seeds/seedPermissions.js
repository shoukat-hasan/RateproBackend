const mongoose = require("mongoose");
const Permission = require("../models/Permission");

const permissions = [
    { name: "user:create", description: "Create new users" },
    { name: "user:read", description: "View user details" },
    { name: "user:update", description: "Update user details" },
    { name: "user:delete", description: "Delete users" },
    { name: "user:toggle", description: "Toggle user active status" },
    { name: "user:export", description: "Export user data as PDF" },
    { name: "user:notify", description: "Send notifications to users" },
    { name: "role:create", description: "Create custom roles" },
    { name: "role:read", description: "View custom roles" },
    { name: "role:update", description: "Update custom roles" },
    { name: "role:delete", description: "Delete custom roles" },
    { name: "role:assign", description: "Assign roles to users" },
];

const seedPermissions = async () => {
    try {
        for (const perm of permissions) {
            const existingPermission = await Permission.findOne({ name: perm.name });
            if (!existingPermission) {
                await Permission.create({
                    name: perm.name,
                    description: perm.description || `Permission to ${perm.name.split(":")[1]} ${perm.name.split(":")[0]}s`,
                });
            }
        }
    } catch (err) {
        console.error("Error seeding permissions:", err);
        throw err;
    }
};

module.exports = seedPermissions;