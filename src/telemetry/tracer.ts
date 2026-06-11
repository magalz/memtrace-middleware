import { randomUUID } from 'node:crypto';

import { getRegistry } from '../router/classify.js';

export interface TraceContext {
  trace_id: string;
  intent_type: string;
  started_at: string;
}

export function generateTraceId(intentType: string): string {
  const short = getRegistry().getTraceIdPrefix(intentType) ?? (intentType.slice(0, 4) || 'unk');
  const uuid = randomUUID();
  const first8 = uuid.split('-')[0] ?? uuid.slice(0, 8);
  return `${short}-${first8}`;
}

export function createTraceContext(intentType: string): TraceContext {
  return {
    trace_id: generateTraceId(intentType),
    intent_type: intentType,
    started_at: new Date().toISOString(),
  };
}
