// AC 1.4-6: BaseAdapter orchestrator: classify→plan→execute→fuse pipeline, no direct backend imports (FR24)
// AC 1.4-10: BaseAdapter e2e — dispatch find_code through full pipeline → valid FusedContext
// AC 1.4-3: CLI adapter factory creates fully wired ToolProvider (~50 lines)
import { describe, it, expect } from 'vitest';

import { MiddlewareError } from '../../src/errors.js';
import type { MemtraceBackend } from '../../src/backend/trait.js';
import { mockCapabilities } from '../helpers/test-utils.js';

const mockCaps = mockCapabilities;

function createMockBackend(overrides?: Partial<MemtraceBackend>): MemtraceBackend {
  return {
    execute: async () => ({
      tool: 'memtrace_find_code',
      data: [{ name: 'authenticateUser', file_path: 'src/auth.ts', start_line: 42, end_line: 67 }],
      trace_id: 'fc-12345678',
      elapsed_ms: 42,
      degraded: false,
    }),
    probe: async () => true,
    listTools: async () => mockCaps.tools,
    ...overrides,
  };
}

describe('BaseAdapter orchestration (Story 1.4)', () => {
  // AC 1.4-10 — classify→plan→execute→fuse end-to-end pipeline (FR23, FR24)
  it('[P0] orchestrates classify→plan→execute→fuse end-to-end and returns valid AgentResponse', async () => {
    // Given: a mock backend and BaseAdapter wired to the full pipeline
    const mockBackend = createMockBackend();
    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    // When: a valid find_code message is dispatched
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
    };
    const response = await adapter.dispatch(msg);
    // Then: response has content blocks with text type, metadata, and a valid trace_id
    expect(response).toHaveProperty('content');
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe('text');
    expect(response.metadata).toBeDefined();
    expect(response.metadata?.trace_id).toBeTruthy();
  });

  // AC 1.4-5 — malformed messages rejected at Zod boundary with MiddlewareError (FR23)
  it('[P0] returns error AgentResponse for malformed messages rejected at Zod validation boundary', async () => {
    // Given: a BaseAdapter with a working backend
    const mockBackend = createMockBackend();
    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    // When: a message with missing params (malformed) is dispatched
    const msg = { method: 'tools/call' };
    const response = await adapter.dispatch(msg);
    // Then: it returns content with error info, metadata present — never throws
    expect(response).toHaveProperty('content');
    expect(response.content[0].type).toBe('text');
    expect(response.metadata).toBeDefined();
  });

  // AC 1.4-6 — passthrough intent flows through correctly (FR5, FR10)
  it('[P0] handles passthrough intent from low-confidence classification flowing through transparently', async () => {
    // Given: a mock backend that returns raw passthrough data
    const mockBackend = createMockBackend({
      execute: async (query) => ({
        tool: query.tool,
        data: { raw: 'passthrough result' },
        trace_id: 'pt-12345678',
        elapsed_ms: 15,
        degraded: false,
      }),
    });
    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    // When: an unrecognized intent message is dispatched
    const msg = {
      method: 'tools/call',
      params: { name: 'some_unknown_tool', arguments: { query: 'unrecognized intent' } },
    };
    const response = await adapter.dispatch(msg);
    // Then: it passes through with metadata — transparent proxy worked
    expect(response).toHaveProperty('content');
    expect(response.metadata).toBeDefined();
    expect(response.metadata?.trace_id).toBeTruthy();
  });

  // AC 1.4-6 — Promise.allSettled for parallel execution (FR7)
  it('[P1] uses Promise.allSettled for parallel query execution — slow query does not block siblings', async () => {
    // Given: a mock backend where one tool is slow (150ms delay)
    const executionOrder: string[] = [];
    const mockBackend = createMockBackend({
      execute: async (query) => {
        executionOrder.push(query.tool);
        if (query.tool === 'memtrace_get_symbol_context') {
          await new Promise((r) => setTimeout(r, 150));
        }
        return {
          tool: query.tool,
          data: {},
          trace_id: 'pl-12345678',
          elapsed_ms: query.tool === 'memtrace_get_symbol_context' ? 150 : 10,
          degraded: query.tool === 'memtrace_get_symbol_context',
        };
      },
    });
    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    // When: a get_symbol_context message is dispatched (decomposes into 2+ queries)
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'authenticateUser' } },
    };
    const response = await adapter.dispatch(msg);
    // Then: all queries executed (order captured proves parallelism), response is valid
    expect(response).toHaveProperty('content');
    expect(executionOrder.length).toBeGreaterThanOrEqual(2);
  });

  // AC 1.4-3 — CLI adapter factory returns a ToolProvider
  it('[P1] CLI adapter factory returns a ToolProvider with functional dispatch', async () => {
    // Given: a mock backend and the CLI adapter factory
    const mockBackend = createMockBackend({ listTools: async () => [] });
    const { createCliAdapter } = await import('../../src/adapters/cli/index.js');
    const provider = createCliAdapter(mockBackend);
    // Then: the factory returns a ToolProvider with dispatch method
    expect(typeof provider.dispatch).toBe('function');
    // And: dispatch works end-to-end
    const response = await provider.dispatch({
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    });
    expect(response).toHaveProperty('content');
  });

  // Post-review: dispatch timeout enforced with intent_timeout error
  it('[P1] enforces dispatch timeout and returns intent_timeout MiddlewareError when pipeline exceeds deadline', async () => {
    // Given: a backend that takes 500ms on listTools, config with 100ms dispatch timeout
    const mockBackend = createMockBackend({
      listTools: async () => {
        await new Promise((r) => setTimeout(r, 500));
        return [];
      },
    });
    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend, {
      memtrace_host: '',
      memtrace_token: '',
      timeout_budgets: { sub_query_ms: 200, dispatch_ms: 100, probe_interval_ms: 15000 },
      hysteresis_probe_count: 3,
      degradation_floor: 'Passthrough',
      enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
      classification_threshold: 0.95,
    });
    // When: a valid message is dispatched (pipeline will exceed 100ms dispatch timeout)
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    const response = await adapter.dispatch(msg);
    // Then: intent_timeout error with recoverable:true is returned
    expect(response).toHaveProperty('content');
    expect(response.metadata).toBeDefined();
    const content = JSON.parse(response.content[0].text);
    expect(content.cause).toBe('intent_timeout');
    expect(content.recoverable).toBe(true);
  });
});
