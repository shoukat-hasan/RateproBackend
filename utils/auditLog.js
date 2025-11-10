// utils/auditLog.js
const SurveyPublishLog = require('../models/AuditLog.js');

class Logger {
  static async log(functionName, message, logLevel = 'INFO', additionalData = {}) {
    try {
      let ipAddress = 'Unknown';
      let userAgent = 'Unknown';
      
      // In a real scenario, you'd get this from the request object
      if (additionalData.req) {
        ipAddress = additionalData.req.ip || 
                   additionalData.req.headers['x-forwarded-for'] || 
                   additionalData.req.connection.remoteAddress || 
                   'Unknown';
        userAgent = additionalData.req.headers['user-agent'] || 'Unknown';
        
        // Remove req from additionalData to avoid circular references
        delete additionalData.req;
      }

      const logEntry = new SurveyPublishLog({
        logLevel,
        functionName,
        message,
        userId: additionalData.userId || null,
        surveyId: additionalData.surveyId || null,
        ipAddress,
        userAgent,
        additionalData,
        stackTrace: additionalData.stackTrace || null
      });

      await logEntry.save();
      
      // Also log to console for development
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] ${logLevel}: ${functionName} - ${message}`);
      
      return logEntry._id;
      
    } catch (error) {
      console.error('Logging failed:', error.message);
      return null;
    }
  }

  static async info(functionName, message, additionalData = {}) {
    return await this.log(functionName, message, 'INFO', additionalData);
  }

  static async warning(functionName, message, additionalData = {}) {
    return await this.log(functionName, message, 'WARNING', additionalData);
  }

  static async error(functionName, message, additionalData = {}) {
    return await this.log(functionName, message, 'ERROR', additionalData);
  }

  static async debug(functionName, message, additionalData = {}) {
    return await this.log(functionName, message, 'DEBUG', additionalData);
  }
}

module.exports = Logger;