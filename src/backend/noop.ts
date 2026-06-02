import { MiddlewareError } from '../errors.js';
import type { GraphQuery, QueryResult, ToolSchema } from '../types.js';
import type { MemtraceBackend } from './trait.js';

export function createNoopBackend(): MemtraceBackend {
  return {
    async execute(_query: GraphQuery, _signal: AbortSignal): Promise<QueryResult> {
      throw new MiddlewareError({
        cause: 'memtrace_unavailable',
        recoverable: true,
        suggested_action: 'connect_first',
      });
    },
    async probe(): Promise<boolean> {
      return false;
    },
    async listTools(): Promise<ToolSchema[]> {
      return [];
    },
    async disconnect(): Promise<void> {
      // no-op
    },
  };
}
