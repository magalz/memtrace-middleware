export enum DegradationTier {
  Full = 'full',
  IntentReduced = 'intent_reduced',
  Passthrough = 'passthrough',
  FailClosed = 'fail_closed',
}

export type ErrorCause =
  | 'memtrace_unavailable'
  | 'intent_timeout'
  | 'classification_low_confidence'
  | 'classification_failed'
  | 'query_execution_failed'
  | 'fusion_validation_failed'
  | 'config_invalid';

export interface MiddlewareErrorShape {
  tier: DegradationTier;
  cause: ErrorCause;
  recoverable: boolean;
  suggested_action: string;
  trace_id: string;
}

export interface MemtraceCapabilities {
  tools: ToolSchema[];
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface QueryResult {
  tool: string;
  data: unknown;
  trace_id: string;
  elapsed_ms: number;
  degraded: boolean;
}

export interface FusedInput {
  results: QueryResult[];
  intent_type: string;
}

export interface FusedContext {
  blocks: ContextBlock[];
  partial: boolean;
  trace_id: string;
  provenance: string[];
}

export interface ContextBlock {
  symbol: string;
  file_path: string;
  start_line: number;
  end_line: number;
  centrality: number;
  query_type: string;
}

export interface ClassifiedIntent {
  intent_type: string;
  confidence: number;
  passthrough: boolean;
  original_message: unknown;
}

export interface GraphQuery {
  tool: string;
  arguments: Record<string, unknown>;
}

export type Result<T, E = MiddlewareErrorShape> = { ok: true; value: T } | { ok: false; error: E };

export type EventType =
  | 'dispatch_start'
  | 'dispatch_end'
  | 'classify'
  | 'plan'
  | 'query'
  | 'fuse'
  | 'status';

export interface TelemetryEvent {
  type: EventType;
  trace_id: string;
  tier: DegradationTier;
  phase: string;
  elapsed_ms: number;
  timestamp: string;
}

export interface StatusSnapshot {
  tier: DegradationTier;
  uptime_seconds: number;
  active_intents: string[];
  query_success: number;
  query_failure: number;
  confidence_p50: number;
  confidence_p95: number;
  last_dispatch_result: 'success' | 'failure' | null;
}
