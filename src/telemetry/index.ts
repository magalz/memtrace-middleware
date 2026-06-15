import { metrics as metricsInstance } from './metrics.js';

export { buildTelemetryResponse } from './api.js';
export { RingBuffer } from './ring-buffer.js';
export { emit } from './emitter.js';
export { metrics } from './metrics.js';
export { getUptimeSeconds } from './uptime.js';
export { generateTraceId, createTraceContext } from './tracer.js';
export type { TraceContext } from './tracer.js';
export { saveBaseline, loadBaseline, computeDrift } from './baseline.js';
export type { BaselineDrift } from './baseline.js';
export {
  coldStartRecordDispatch,
  isColdStart,
  getColdStartStats,
  resetColdStartDetector,
} from './cold-start.js';

export function getP50History(): number[] {
  return metricsInstance.getP50History();
}
