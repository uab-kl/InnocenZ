import winston from 'winston';
import { env } from '@/env';

const { combine, timestamp, json, colorize, printf } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level}: ${message}${extra}`;
  }),
);

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? env.LOGGING_LEVEL : 'debug',
  format: env.NODE_ENV === 'production' ? combine(timestamp(), json()) : devFormat,
  transports: [new winston.transports.Console()],
});
