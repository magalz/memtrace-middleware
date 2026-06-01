import type { MemtraceBackend } from '../../src/backend/trait.js';
import { DEFAULT_CONFIG, type MiddlewareConfig } from '../../src/config/types.js';

export function createProbeMockBackend(opts: {
  probeFails: boolean;
  probeDelayMs?: number;
}): MemtraceBackend {
  return {
    execute: async () => ({
      tool: 'memtrace_find_code',
      data: [],
      trace_id: 't1',
      elapsed_ms: 10,
      degraded: false,
    }),
    probe: async () => {
      if (opts.probeDelayMs) {
        await new Promise((r) => setTimeout(r, opts.probeDelayMs));
      }
      return !opts.probeFails;
    },
    listTools: async () => [
      { name: 'memtrace_find_code', description: '', inputSchema: {} },
      { name: 'memtrace_get_symbol_context', description: '', inputSchema: {} },
      { name: 'memtrace_get_impact', description: '', inputSchema: {} },
    ],
  };
}

export function createDegradationConfig(overrides?: Partial<MiddlewareConfig>): MiddlewareConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}
