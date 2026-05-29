import { createLogger } from '../logger.js';
import type { TelemetryEvent } from '../types.js';

const log = createLogger('telemetry');

export function emit(event: TelemetryEvent): void {
  process.stderr.write(JSON.stringify(event) + '\n');
}

export { log as emitterLog };
