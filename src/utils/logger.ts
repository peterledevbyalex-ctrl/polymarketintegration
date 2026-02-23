import winston from 'winston';
import { redactSensitiveData } from '../middleware/security';

// Get log level - handle case where config might not be loaded yet (tests)
const getLogLevel = (): string => {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  try {
    // Try to get from config, but don't fail if it's not loaded
    const { config } = require('../config');
    return config?.logging?.level || 'info';
  } catch {
    return 'info';
  }
};

// Custom format to redact sensitive data
const redactFormat = winston.format((info) => {
  // Redact sensitive data from metadata
  if (info.metadata && typeof info.metadata === 'object') {
    info.metadata = redactSensitiveData(info.metadata);
  }
  // Redact sensitive data from message if it's an object
  if (info.message && typeof info.message === 'object') {
    info.message = redactSensitiveData(info.message);
  }
  return info;
});

const logger = winston.createLogger({
  level: getLogLevel(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    redactFormat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'prism-backend-pm' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

export default logger;

