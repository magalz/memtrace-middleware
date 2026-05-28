import type { GraphQuery, QueryResult, ToolSchema } from '../types.js';

export interface MemtraceBackend {
  execute(query: GraphQuery, signal: AbortSignal): Promise<QueryResult>;
  probe(): Promise<boolean>;
  listTools(): Promise<ToolSchema[]>;
}
