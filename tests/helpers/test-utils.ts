import type { MemtraceCapabilities, ClassifiedIntent } from '../../src/types.js';

export const mockCapabilities: MemtraceCapabilities = {
  tools: [
    { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
    { name: 'memtrace_get_symbol_context', description: 'Get symbol context', inputSchema: {} },
    { name: 'memtrace_get_impact', description: 'Get impact', inputSchema: {} },
  ],
};

export function makeMessage(text: string, tool?: string): Record<string, unknown> {
  return {
    method: 'tools/call',
    params: {
      name: tool ?? 'memtrace_find_code',
      arguments: { query: text },
    },
  };
}

export function makeToolMessage(tool: string): Record<string, unknown> {
  return {
    method: 'tools/call',
    params: {
      name: tool,
      arguments: { name: 'someFunction', scope: 'callers' },
    },
  };
}

export function buildIntent(overrides: Partial<ClassifiedIntent> = {}): ClassifiedIntent {
  return {
    intent_type: 'find_code',
    confidence: 0.98,
    passthrough: false,
    original_message: {
      method: 'tools/call',
      params: {
        name: 'memtrace_find_code',
        arguments: { query: 'authenticateUser' },
      },
    },
    ...overrides,
  };
}
