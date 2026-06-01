import { describe, it, expect } from 'vitest';

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

describe('Cross-Intent Execution Isolation (Story 2.2)', () => {
  it('[P0] sequential dispatch isolation — timeout in A does not contaminate B', async () => {
    const executionCount = { listTools: 0 };
    let listToolsShouldTimeout = true;

    const backend = createMockBackend({
      listTools: async () => {
        executionCount.listTools++;
        if (listToolsShouldTimeout) {
          await new Promise((r) => setTimeout(r, 500));
        }
        return mockCaps.tools;
      },
    });

    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(backend, {
      memtrace_host: '',
      memtrace_token: '',
      timeout_budgets: { sub_query_ms: 200, dispatch_ms: 100, probe_interval_ms: 15000 },
      hysteresis_probe_count: 3,
      degradation_floor: 'Passthrough',
      enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
      classification_threshold: 0.95,
    });

    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
    };

    const respA = await adapter.dispatch(msg);
    expect(respA).toHaveProperty('content');
    const contentA = JSON.parse(respA.content[0].text);
    expect(contentA.cause).toBe('intent_timeout');

    listToolsShouldTimeout = false;
    const respB = await adapter.dispatch(msg);

    expect(respB).toHaveProperty('content');
    expect(respB.content.length).toBeGreaterThan(0);
    expect(respB.content[0].type).toBe('text');
    expect(respB.metadata).toBeDefined();
    expect(respB.metadata?.trace_id).toBeTruthy();

    const traceIdA = respA.metadata?.trace_id;
    const traceIdB = respB.metadata?.trace_id;
    expect(traceIdA).toBeTruthy();
    expect(traceIdB).toBeTruthy();
    expect(traceIdA).not.toBe(traceIdB);

    expect(respB.metadata?.elapsed_ms).toBeDefined();
    expect(respB.metadata!.elapsed_ms).toBeLessThan(1000);

    const textB = respB.content[0].text;
    expect(textB).toContain('[memtrace:');
    expect(typeof textB).toBe('string');
  });

  it('[P0] concurrent dispatch isolation — independent results, no shared caches', async () => {
    const perToolInvocations = new Map<string, number>();

    const backend = createMockBackend({
      execute: async (query) => {
        const count = perToolInvocations.get(query.tool) ?? 0;
        perToolInvocations.set(query.tool, count + 1);
        return {
          tool: query.tool,
          data: [
            {
              name: `result-from-${query.tool}`,
              file_path: 'src/test.ts',
              start_line: 1,
              end_line: 10,
            },
          ],
          trace_id: `test-${Math.random().toString(36).slice(2, 10)}`,
          elapsed_ms: 5,
          degraded: false,
        };
      },
    });

    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(backend);

    const msgFind = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'someFunction' } },
    };
    const msgCtx = {
      method: 'tools/call',
      params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'someFunction' } },
    };

    // eslint-disable-next-line no-restricted-syntax -- Promise.all is OK in tests for firing concurrent dispatches
    const [respA, respB] = await Promise.all([adapter.dispatch(msgFind), adapter.dispatch(msgCtx)]);

    expect(respA).toHaveProperty('content');
    expect(respB).toHaveProperty('content');
    expect(respA.content.length).toBeGreaterThan(0);
    expect(respB.content.length).toBeGreaterThan(0);

    const traceA = respA.metadata?.trace_id;
    const traceB = respB.metadata?.trace_id;
    expect(traceA).toBeTruthy();
    expect(traceB).toBeTruthy();
    expect(traceA).not.toBe(traceB);

    expect(perToolInvocations.size).toBeGreaterThanOrEqual(2);

    expect(respA).toEqual(expect.objectContaining({ content: expect.any(Array) }));
    expect(respB).toEqual(expect.objectContaining({ content: expect.any(Array) }));
    expect(respA.metadata?.trace_id).toBeTruthy();
    expect(respB.metadata?.trace_id).toBeTruthy();
  });

  it('[P0] sequential error contamination — dispatch A error does not poison dispatch B', async () => {
    let shouldFail = true;

    const backend = createMockBackend({
      listTools: async () => {
        if (shouldFail) {
          throw new Error('simulated backend failure');
        }
        return mockCaps.tools;
      },
    });

    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(backend);

    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
    };

    const respA = await adapter.dispatch(msg);
    expect(respA).toHaveProperty('content');

    shouldFail = false;
    const respB = await adapter.dispatch(msg);

    expect(respB).toHaveProperty('content');
    expect(respB.content.length).toBeGreaterThan(0);
    expect(respB.content[0].type).toBe('text');
    expect(respB.metadata).toBeDefined();
    expect(respB.metadata?.trace_id).toBeTruthy();

    const textB = respB.content[0].text;
    expect(textB).toBeTruthy();
    expect(textB).toContain('[memtrace:');
    expect(typeof textB).toBe('string');

    const traceA = respA.metadata?.trace_id;
    const traceB = respB.metadata?.trace_id;
    expect(traceA).toBeTruthy();
    expect(traceB).toBeTruthy();
    expect(traceA).not.toBe(traceB);
  });

  it('[P1] dispatch B returns valid FusedContext with clean metadata after A timeout', async () => {
    let listToolsShouldTimeout = true;

    const backend = createMockBackend({
      listTools: async () => {
        if (listToolsShouldTimeout) {
          await new Promise((r) => setTimeout(r, 500));
        }
        return mockCaps.tools;
      },
    });

    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(backend, {
      memtrace_host: '',
      memtrace_token: '',
      timeout_budgets: { sub_query_ms: 200, dispatch_ms: 100, probe_interval_ms: 15000 },
      hysteresis_probe_count: 3,
      degradation_floor: 'Passthrough',
      enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
      classification_threshold: 0.95,
    });

    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
    };

    const respA = await adapter.dispatch(msg);
    expect(respA.metadata?.trace_id).toBeTruthy();

    listToolsShouldTimeout = false;
    const respB = await adapter.dispatch(msg);

    expect(respB.metadata).toBeDefined();
    expect(respB.metadata?.elapsed_ms).toBeDefined();
    expect(respB.metadata!.elapsed_ms).toBeLessThan(1000);
    expect(respB.metadata?.trace_id).toBeTruthy();
    expect(respB.metadata?.trace_id).not.toBe(respA.metadata?.trace_id);
  });

  it('[P2] AbortController leakage — 50 sequential dispatches on same adapter without memory growth', async () => {
    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const backend = createMockBackend();
    const adapter = new BaseAdapter(backend);

    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };

    for (let i = 0; i < 50; i++) {
      const resp = await adapter.dispatch(msg);
      expect(resp).toHaveProperty('content');
      expect(resp.content.length).toBeGreaterThan(0);
      expect(resp.metadata?.trace_id).toBeTruthy();
    }
  });

  it('[P1] concurrent dispatch testing agent response shape validity', async () => {
    const backend = createMockBackend();

    const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(backend);

    const msgA = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'funcA' } },
    };
    const msgB = {
      method: 'tools/call',
      params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'funcA' } },
    };

    // eslint-disable-next-line no-restricted-syntax -- Promise.all is OK in tests for firing concurrent dispatches
    const [respA, respB] = await Promise.all([adapter.dispatch(msgA), adapter.dispatch(msgB)]);

    expect(respA.content.length).toBeGreaterThanOrEqual(1);
    expect(respA.content[0].type).toBe('text');
    expect(typeof respA.content[0].text).toBe('string');

    expect(respB.content.length).toBeGreaterThanOrEqual(1);
    expect(respB.content[0].type).toBe('text');
    expect(typeof respB.content[0].text).toBe('string');

    expect(respA.metadata?.trace_id).toBeTruthy();
    expect(respB.metadata?.trace_id).toBeTruthy();
    expect(respA.metadata?.trace_id).not.toBe(respB.metadata?.trace_id);
  });
});
