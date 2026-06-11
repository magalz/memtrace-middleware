import { z } from 'zod';

import { DegradationTier } from '../types.js';

export const DEGRADATION_FLOOR_VALUES = [
  'Full',
  'Intent-reduced',
  'Passthrough',
  'Fail-closed',
] as const;

export type DegradationFloor = (typeof DEGRADATION_FLOOR_VALUES)[number];

export const INTENT_TYPE_VALUES = [
  'find_code',
  'get_symbol_context',
  'get_impact',
  'review_code',
  'get_style_fingerprint',
  'find_dead_code',
  'get_evolution',
  'get_process_flow',
  'get_api_topology',
  'find_bridge_symbols',
  'find_central_symbols',
  'find_dependency_path',
] as const;

export type IntentType = (typeof INTENT_TYPE_VALUES)[number];

export interface MiddlewareConfig {
  memtrace_host: string;
  memtrace_token: string;
  timeout_budgets: {
    sub_query_ms: number;
    dispatch_ms: number;
    probe_interval_ms: number;
  };
  hysteresis_probe_count: number;
  degradation_floor: DegradationFloor;
  enabled_intents: IntentType[];
  classification_threshold: number;
}

export const middlewareConfigSchema: z.ZodType<MiddlewareConfig> = z.object({
  memtrace_host: z.string().min(1),
  memtrace_token: z.string(),
  timeout_budgets: z.object({
    sub_query_ms: z.number().int().positive(),
    dispatch_ms: z.number().int().positive(),
    probe_interval_ms: z.number().int().positive(),
  }),
  hysteresis_probe_count: z.number().int().positive(),
  degradation_floor: z.enum(DEGRADATION_FLOOR_VALUES),
  enabled_intents: z.array(z.enum(INTENT_TYPE_VALUES)).min(1),
  classification_threshold: z.number().min(0).max(1),
});

export const DEFAULT_CONFIG: MiddlewareConfig = {
  memtrace_host: 'http://localhost:8080',
  memtrace_token: '',
  timeout_budgets: {
    sub_query_ms: 200,
    dispatch_ms: 3000,
    probe_interval_ms: 15000,
  },
  hysteresis_probe_count: 3,
  degradation_floor: 'Passthrough',
  enabled_intents: [
    'find_code',
    'get_symbol_context',
    'get_impact',
    'review_code',
    'get_style_fingerprint',
    'find_dead_code',
    'get_evolution',
    'get_process_flow',
    'get_api_topology',
    'find_bridge_symbols',
    'find_central_symbols',
    'find_dependency_path',
  ],
  classification_threshold: 0.95,
};

export type ConfigDelta = Partial<MiddlewareConfig>;

const FLOOR_TO_TIER: Record<DegradationFloor, DegradationTier> = {
  Full: DegradationTier.Full,
  'Intent-reduced': DegradationTier.IntentReduced,
  Passthrough: DegradationTier.Passthrough,
  'Fail-closed': DegradationTier.FailClosed,
};

export function normalizeFloor(floor: DegradationFloor): DegradationTier {
  return FLOOR_TO_TIER[floor];
}
