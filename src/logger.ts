import { createLogger, format, transports } from 'winston';

const LOG_LEVEL_INFO = 'info';

export const logger = createLogger({
  level: LOG_LEVEL_INFO,
  transports: [
    new transports.Console({ format: format.simple(), handleExceptions: true }),
  ],
});
