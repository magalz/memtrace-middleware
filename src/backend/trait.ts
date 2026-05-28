import type { GraphQuery, QueryResult, ToolSchema } from '../types.js';

export interface DegradationProbeHooks {
  shouldDegrade?(): boolean;
  onProbeResult?(success: boolean): void;
  getCircuitState?(): { state: string };
  getRecoverySignal?(): string | null;
}

export interface MemtraceBackend {
  execute(query: GraphQuery, signal: AbortSignal): Promise<QueryResult>;
  probe(): Promise<boolean>;
  listTools(): Promise<ToolSchema[]>;
  degradationHooks?: DegradationProbeHooks;
}
