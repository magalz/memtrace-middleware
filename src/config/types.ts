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

export interface DashboardWarningThresholds {
  success_rate_warn: number;
  success_rate_crit: number;
  latency_p95_warn_ms: number;
  latency_p95_crit_ms: number;
  uptime_warn_pct: number;
  uptime_crit_pct: number;
  confidence_median_warn: number;
  confidence_median_crit: number;
}

export interface RateLimitingConfig {
  enabled: boolean;
  max_requests_per_window: number;
  window_ms: number;
  max_concurrent: number;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failure_threshold: number;
  success_threshold: number;
  half_open_max_calls: number;
  open_state_ms: number;
}

export interface PruningConfig {
  enabled: boolean;
  max_turn_threshold: number;
  recency_window: number;
}

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
  rate_limiting: RateLimitingConfig;
  circuit_breaker: CircuitBreakerConfig;
  dashboard_warning_thresholds?: DashboardWarningThresholds;
  pruning?: PruningConfig;
}

export const dashboardWarningThresholdsSchema: z.ZodType<DashboardWarningThresholds> = z
  .object({
    success_rate_warn: z.number().min(0).max(1),
    success_rate_crit: z.number().min(0).max(1),
    latency_p95_warn_ms: z.number().positive(),
    latency_p95_crit_ms: z.number().positive(),
    uptime_warn_pct: z.number().min(0).max(100),
    uptime_crit_pct: z.number().min(0).max(100),
    confidence_median_warn: z.number().min(0).max(1),
    confidence_median_crit: z.number().min(0).max(1),
  })
  .refine((v) => v.success_rate_crit < v.success_rate_warn, {
    message: 'success_rate_crit must be lower than success_rate_warn',
  })
  .refine((v) => v.latency_p95_crit_ms > v.latency_p95_warn_ms, {
    message: 'latency_p95_crit_ms must be higher than latency_p95_warn_ms',
  })
  .refine((v) => v.uptime_crit_pct < v.uptime_warn_pct, {
    message: 'uptime_crit_pct must be lower than uptime_warn_pct',
  })
  .refine((v) => v.confidence_median_crit < v.confidence_median_warn, {
    message: 'confidence_median_crit must be lower than confidence_median_warn',
  });

export const rateLimitingSchema = z.object({
  enabled: z.boolean(),
  max_requests_per_window: z.number().int().positive(),
  window_ms: z.number().int().positive(),
  max_concurrent: z.number().int().positive(),
});

export const circuitBreakerSchema = z.object({
  enabled: z.boolean(),
  failure_threshold: z.number().int().positive(),
  success_threshold: z.number().int().positive(),
  half_open_max_calls: z.number().int().positive(),
  open_state_ms: z.number().int().positive(),
});

export const pruningConfigSchema: z.ZodType<PruningConfig> = z.object({
  enabled: z.boolean(),
  max_turn_threshold: z.number().int().positive(),
  recency_window: z.number().int().positive(),
});

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
  rate_limiting: rateLimitingSchema,
  circuit_breaker: circuitBreakerSchema,
  dashboard_warning_thresholds: dashboardWarningThresholdsSchema.optional(),
  pruning: pruningConfigSchema.optional(),
});

export const DEFAULT_CONFIG: MiddlewareConfig = {
  memtrace_host: 'http://localhost:3030',
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
  dashboard_warning_thresholds: {
    success_rate_warn: 0.95,
    success_rate_crit: 0.8,
    latency_p95_warn_ms: 600,
    latency_p95_crit_ms: 900,
    uptime_warn_pct: 90,
    uptime_crit_pct: 70,
    confidence_median_warn: 0.9,
    confidence_median_crit: 0.7,
  },
  rate_limiting: {
    enabled: true,
    max_requests_per_window: 100,
    window_ms: 60000,
    max_concurrent: 10,
  },
  circuit_breaker: {
    enabled: true,
    failure_threshold: 5,
    success_threshold: 3,
    half_open_max_calls: 3,
    open_state_ms: 30000,
  },
  pruning: {
    enabled: true,
    max_turn_threshold: 20,
    recency_window: 5,
  },
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
