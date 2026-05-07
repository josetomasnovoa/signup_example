import pino, { type Logger, type LoggerOptions } from 'pino';

/**
 * Paths that pino must redact from every log line. Anything resembling a
 * credential, key, or bearer token must live under one of these paths in the
 * log object — and we test (in CI) that injecting a fake key never appears.
 */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'headers.authorization',
  'headers.cookie',
  '*.apiKey',
  '*.api_key',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.byokKey',
  '*.password',
  '*.secret',
  '*.privateKey',
];

export interface LoggerConfigOptions {
  service: string;
  level?: pino.Level;
}

/**
 * Build a pino LoggerOptions object reusable by both standalone services
 * (worker, mcp-server) and Fastify's built-in pino integration.
 */
export function loggerConfig(opts: LoggerConfigOptions): LoggerOptions {
  return {
    level: opts.level ?? (process.env.LOG_LEVEL as pino.Level) ?? 'info',
    base: { service: opts.service },
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export function createLogger(opts: LoggerConfigOptions): Logger {
  return pino(loggerConfig(opts));
}

export type { Logger };
