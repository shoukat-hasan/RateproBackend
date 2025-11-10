// controllers/subscriptionController.js
const Subscription = require("../models/Subscription");
const Logger = require("../utils/auditLog");

// Get subscription
exports.getSubscription = async (req, res, next) => {
  try {
    await Logger.info("getSubscription: Start fetching subscription", {
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });

    const subscription = await Subscription.findOne({ tenant: req.user.tenant });

    if (!subscription) {
      await Logger.warn("getSubscription: No subscription found", {
        tenantId: req.user?.tenant,
      });
      return res.status(404).json({ message: "No subscription found" });
    }

    await Logger.info("getSubscription: Subscription retrieved successfully", {
      tenantId: req.user?.tenant,
      subscriptionId: subscription._id,
    });

    res.status(200).json(subscription);
  } catch (err) {
    await Logger.error("getSubscription: Error fetching subscription", {
      error: err.message,
      stack: err.stack,
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });
    next(err);
  }
};

// Request upgrade
exports.requestUpgrade = async (req, res, next) => {
  try {
    await Logger.info("requestUpgrade: Upgrade request initiated", {
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });

    // TODO: store request in DB or trigger payment gateway process
    // Example:
    // await UpgradeRequest.create({ tenant: req.user.tenant, requestedBy: req.user._id, status: "pending" });

    await Logger.info("requestUpgrade: Upgrade request stored successfully", {
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });

    res
      .status(200)
      .json({
        message: "Upgrade request received. Our team will contact you soon.",
      });
  } catch (err) {
    await Logger.error("requestUpgrade: Error handling upgrade request", {
      error: err.message,
      stack: err.stack,
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });
    next(err);
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res, next) => {
  try {
    await Logger.info("cancelSubscription: Cancellation initiated", {
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });

    const subscription = await Subscription.findOneAndUpdate(
      { tenant: req.user.tenant },
      { status: "cancelled", cancelledAt: new Date() },
      { new: true }
    );

    if (!subscription) {
      await Logger.warn("cancelSubscription: No active subscription found", {
        tenantId: req.user?.tenant,
      });
      return res.status(404).json({ message: "No subscription found" });
    }

    await Logger.info("cancelSubscription: Subscription cancelled successfully", {
      tenantId: req.user?.tenant,
      cancelledBy: req.user?._id,
    });

    res
      .status(200)
      .json({ message: "Subscription cancelled successfully", subscription });
  } catch (err) {
    await Logger.error("cancelSubscription: Error cancelling subscription", {
      error: err.message,
      stack: err.stack,
      performedBy: req.user?._id,
      tenantId: req.user?.tenant,
    });
    next(err);
  }
};
