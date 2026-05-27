type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

function emit(
  level: LogLevel,
  module: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const entry = {
    ...meta,
    level,
    module,
    message,
    timestamp: new Date().toISOString(),
  };
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export function createLogger(module: string): Logger {
  return {
    debug: (message, meta) => emit('debug', module, message, meta),
    info: (message, meta) => emit('info', module, message, meta),
    warn: (message, meta) => emit('warn', module, message, meta),
    error: (message, meta) => emit('error', module, message, meta),
  };
}
