const Subscription = require("../models/Subscription");

// Get subscription
exports.getSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ tenant: req.user.tenant });
    if (!subscription) return res.status(404).json({ message: "No subscription found" });
    res.status(200).json(subscription);
  } catch (err) {
    next(err);
  }
};

// Request upgrade
exports.requestUpgrade = async (req, res, next) => {
  try {
    // store upgrade request (could also trigger payment gateway integration)
    res.status(200).json({ message: "Upgrade request received. Our team will contact you." });
  } catch (err) {
    next(err);
  }
};

// Cancel subscription
exports.cancelSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOneAndUpdate(
      { tenant: req.user.tenant },
      { status: "cancelled" },
      { new: true }
    );
    res.status(200).json({ message: "Subscription cancelled", subscription });
  } catch (err) {
    next(err);
  }
};
