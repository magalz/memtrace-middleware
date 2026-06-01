import { randomUUID } from 'node:crypto';

const INTENT_SHORT_CODES: Record<string, string> = {
  find_code: 'fc',
  get_symbol_context: 'gsc',
  get_impact: 'gi',
};

export interface TraceContext {
  trace_id: string;
  intent_type: string;
  started_at: string;
}

export function generateTraceId(intentType: string): string {
  const short = INTENT_SHORT_CODES[intentType] ?? (intentType.slice(0, 4) || 'unk');
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
