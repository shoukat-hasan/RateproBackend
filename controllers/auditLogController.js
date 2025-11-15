// controllers/auditLogController.js
const AuditLog = require('../models/Logs.js');
const Logger = require('../utils/auditLog.js');

// Create Log Entry
exports.createLog = async (req, res) => {
  try {
    const { functionName, message, logLevel, additionalData } = req.body;

    await Logger.info('createLog', 'Creating new log entry', {
      functionName,
      logLevel,
      userId: req.user?._id
    });

    const logEntry = await Logger.log(
      functionName, 
      message, 
      logLevel, 
      { ...additionalData, req }
    );

    res.status(201).json({
      success: true,
      data: logEntry,
      message: 'Log entry created successfully'
    });

  } catch (error) {
    await Logger.error('createLog', 'Error creating log entry', {
      error: error.message,
      body: req.body,
      userId: req.user?._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error creating log entry',
      error: error.message
    });
  }
};

// Get All Logs with Filtering
exports.getLogs = async (req, res) => {
  try {
    await Logger.info('getLogs', 'Fetching logs with filters', {
      query: req.query,
      userId: req.user?._id
    });

    const {
      logLevel,
      functionName,
      surveyId,
      userId,
      startDate,
      endDate,
      page = 1,
      limit = 50
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (logLevel) filter.logLevel = logLevel;
    if (functionName) filter.functionName = { $regex: functionName, $options: 'i' };
    if (surveyId) filter.surveyId = surveyId;
    if (userId) filter.userId = userId;
    
    // Date range filter
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email')
      .populate('surveyId', 'title');

    const total = await AuditLog.countDocuments(filter);

    await Logger.info('getLogs', `Found ${logs.length} logs`, {
      total,
      page,
      limit,
      userId: req.user?._id
    });

    res.json({
      success: true,
      data: logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    await Logger.error('getLogs', 'Error fetching logs', {
      error: error.message,
      query: req.query,
      userId: req.user?._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching logs',
      error: error.message
    });
  }
};

// Get Log by ID
exports.getLogById = async (req, res) => {
  try {
    const { id } = req.params;

    await Logger.info('getLogById', 'Fetching log by ID', {
      logId: id,
      userId: req.user?._id
    });

    const log = await AuditLog.findById(id)
      .populate('userId', 'name email')
      .populate('surveyId', 'title');

    if (!log) {
      await Logger.warning('getLogById', 'Log not found', {
        logId: id,
        userId: req.user?._id
      });
      
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    await Logger.info('getLogById', 'Log found successfully', {
      logId: id,
      userId: req.user?._id
    });

    res.json({
      success: true,
      data: log
    });

  } catch (error) {
    await Logger.error('getLogById', 'Error fetching log by ID', {
      error: error.message,
      logId: req.params.id,
      userId: req.user?._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching log',
      error: error.message
    });
  }
};

// Get Log Statistics
exports.getLogStatistics = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    await Logger.info('getLogStatistics', 'Fetching log statistics', {
      days,
      userId: req.user?._id
    });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const statistics = await AuditLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            logLevel: '$logLevel',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.logLevel',
          dailyCounts: {
            $push: {
              date: '$_id.date',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    // Get most frequent errors
    const frequentErrors = await AuditLog.aggregate([
      {
        $match: {
          logLevel: 'ERROR',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$functionName',
          count: { $sum: 1 },
          lastOccurred: { $max: '$createdAt' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    await Logger.info('getLogStatistics', 'Log statistics fetched successfully', {
      days,
      userId: req.user?._id
    });

    res.json({
      success: true,
      data: {
        statistics,
        frequentErrors,
        period: {
          startDate,
          endDate: new Date(),
          days: parseInt(days)
        }
      }
    });

  } catch (error) {
    await Logger.error('getLogStatistics', 'Error fetching log statistics', {
      error: error.message,
      query: req.query,
      userId: req.user?._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching log statistics',
      error: error.message
    });
  }
};

// Delete Log
exports.deleteLog = async (req, res) => {
  try {
    const { id } = req.params;

    await Logger.info('deleteLog', 'Deleting log entry', {
      logId: id,
      userId: req.user?._id
    });

    const log = await AuditLog.findByIdAndDelete(id);

    if (!log) {
      await Logger.warning('deleteLog', 'Log not found for deletion', {
        logId: id,
        userId: req.user?._id
      });
      
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    await Logger.info('deleteLog', 'Log deleted successfully', {
      logId: id,
      userId: req.user?._id
    });

    res.json({
      success: true,
      message: 'Log deleted successfully'
    });

  } catch (error) {
    await Logger.error('deleteLog', 'Error deleting log', {
      error: error.message,
      logId: req.params.id,
      userId: req.user?._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error deleting log',
      error: error.message
    });
  }
};

// Clean Old Logs (Maintenance)
exports.cleanOldLogs = async (req, res) => {
  try {
    const { days = 30 } = req.body;

    await Logger.info('cleanOldLogs', 'Cleaning old logs', {
      days,
      userId: req.user?._id
    });

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));

    const result = await AuditLog.deleteMany({
      createdAt: { $lt: cutoffDate },
      logLevel: { $ne: 'ERROR' } // Keep all errors
    });

    await Logger.info('cleanOldLogs', 'Old logs cleaned successfully', {
      deletedCount: result.deletedCount,
      days,
      userId: req.user?._id
    });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} logs older than ${days} days`,
      deletedCount: result.deletedCount
    });

  } catch (error) {
    await Logger.error('cleanOldLogs', 'Error cleaning old logs', {
      error: error.message,
      body: req.body,
      userId: req.user?._id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error cleaning old logs',
      error: error.message
    });
  }
};