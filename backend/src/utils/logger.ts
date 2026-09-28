type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
  correlationId?: string;
  component?: string;
  [key: string]: unknown;
}

/**
 * Structured Logger: outputs standardized, parseable log entries with
 * ISO timestamps, log levels, correlation IDs, and component tags.
 * Redacts known sensitive fields (passwords, tokens, secret keys).
 */
export const logger = {
  info(message: string, context?: LogContext): void {
    printLog('info', message, context);
  },
  warn(message: string, context?: LogContext): void {
    printLog('warn', message, context);
  },
  error(message: string, error?: unknown, context?: LogContext): void {
    const errDetails = error instanceof Error 
      ? { errorMessage: error.message, stack: process.env.NODE_ENV === 'development' ? error.stack : undefined }
      : { errorMessage: String(error) };
    printLog('error', message, { ...context, ...errDetails });
  },
  debug(message: string, context?: LogContext): void {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      printLog('debug', message, context);
    }
  }
};

function printLog(level: LogLevel, message: string, context?: LogContext): void {
  const timestamp = new Date().toISOString();
  const safeContext = sanitizeLogContext(context);
  const line = `[${timestamp}] [${level.toUpperCase()}]${safeContext?.correlationId ? ` [${safeContext.correlationId}]` : ''}${safeContext?.component ? ` [${safeContext.component}]` : ''}: ${message}`;

  if (level === 'error') {
    console.error(line, Object.keys(safeContext || {}).length > 2 ? safeContext : '');
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Redacts passwords, secrets, tokens from log context objects.
 */
function sanitizeLogContext(ctx?: LogContext): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const sensitiveKeys = ['password', 'token', 'jwt', 'secret', 'authorization', 'bearer'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ctx)) {
    if (sensitiveKeys.some(s => key.toLowerCase().includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogContext(value as LogContext);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
