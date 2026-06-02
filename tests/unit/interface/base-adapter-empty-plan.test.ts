// Story 5.5 — Unit tests for orchestrator empty-plan guard (AC: 1, 2, 3)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { MemtraceBackend } from '../../../src/backend/trait.js';
import * as fusion from '../../../src/fusion/engine.js';
import { mockCapabilities } from '../../helpers/test-utils.js';
import { DegradationTier } from '../../../src/types.js';

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
    listTools: async () => mockCapabilities.tools,
    ...overrides,
  };
}

describe('BaseAdapter empty-plan guard (Story 5.5)', () => {
  let executeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    executeSpy = vi.fn(async () => {
      throw new Error('execute should never be called for empty plan');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Sub-task 4.1 — runDispatch returns early, no execute calls
  it('[P1] runDispatch returns early when queries.length === 0 — backend.execute never called', async () => {
    // Given: mock backend with empty capabilities and spied execute
    const mockBackend = createMockBackend({
      listTools: async () => [],
      execute: executeSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: dispatched (plan produces empty queries)
    const response = await adapter.dispatch(msg);
    // Then: response is defined, metadata present
    expect(response).toBeDefined();
    expect(response.metadata).toBeDefined();
    // And: backend.execute was never called (early return before execution)
    expect(executeSpy).not.toHaveBeenCalled();
  });

  // Sub-task 4.2 — response metadata includes tier info and trace_id
  it('[P1] response metadata includes tier=IntentReduced and trace_id for empty-plan path', async () => {
    // Given: mock backend with empty capabilities
    const mockBackend = createMockBackend({
      listTools: async () => [],
      execute: executeSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: dispatched
    const response = await adapter.dispatch(msg);
    // Then: metadata includes tier (should be IntentReduced for partial response)
    expect(response.metadata?.tier).toBeDefined();
    expect(response.metadata?.tier).toBe(DegradationTier.IntentReduced);
    // And: trace_id is present
    expect(response.metadata?.trace_id).toBeTruthy();
    expect(typeof response.metadata?.trace_id).toBe('string');
    // And: elapsed_ms is a positive number
    expect(typeof response.metadata?.elapsed_ms).toBe('number');
    expect(response.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  // Sub-task 4.3 — buildDefaultContext handles empty blocks without errors
  it('[P2] buildDefaultContext handles empty blocks array — returns "no results" fallback', async () => {
    // Given: mock backend with empty capabilities
    const mockBackend = createMockBackend({
      listTools: async () => [],
      execute: executeSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: dispatched (empty blocks → buildDefaultContext returns 'no results')
    const response = await adapter.dispatch(msg);
    // Then: content has text type with the exact fallback string
    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toBe('no results');
  });

  // Sub-task 3.1 verify — metrics.recordDispatch called for empty-plan path
  it('[P1] metrics.recordDispatch is called with correct params for empty-plan path', async () => {
    // Given: spy on metrics.recordDispatch
    const { metrics } = await import('../../../src/telemetry/metrics.js');
    const recordDispatchSpy = vi.spyOn(metrics, 'recordDispatch');

    const mockBackend = createMockBackend({
      listTools: async () => [],
      execute: executeSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: empty-plan dispatch runs
    await adapter.dispatch(msg);
    // Then: metrics.recordDispatch was called
    expect(recordDispatchSpy).toHaveBeenCalledTimes(1);
    // And: called with success=true, valid intent_type, confidence, elapsed
    const [success, intentType, confidence, elapsed] = recordDispatchSpy.mock.calls[0];
    expect(success).toBe(true);
    expect(intentType).toBeTruthy();
    expect(typeof intentType).toBe('string');
    expect(typeof confidence).toBe('number');
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  // Metrics try/catch graceful degradation test
  it('[P1] returns valid response even when metrics.recordDispatch throws', async () => {
    // Given: metrics.recordDispatch throws
    const { metrics } = await import('../../../src/telemetry/metrics.js');
    const recordDispatchSpy = vi
      .spyOn(metrics, 'recordDispatch')
      .mockImplementation(() => {
        throw new Error('metrics pipeline failure');
      });

    const mockBackend = createMockBackend({
      listTools: async () => [],
      execute: executeSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: empty-plan dispatch runs (metrics throw)
    const response = await adapter.dispatch(msg);
    // Then: response is still valid — metrics failure is non-fatal
    expect(response).toHaveProperty('content');
    expect(response.metadata).toBeDefined();
    expect(response.metadata?.tier).toBe(DegradationTier.IntentReduced);
    // And: recordDispatch was called (and threw)
    expect(recordDispatchSpy).toHaveBeenCalledTimes(1);
  });

  // AC1-U6 — fuse() never called for empty plan
  it('[P2] fuse() is never called when queries are empty (AC1-U6)', async () => {
    // Given: spy on fusion engine
    const fuseSpy = vi.spyOn(fusion, 'fuse');
    const mockBackend = createMockBackend({
      listTools: async () => [],
      execute: executeSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: empty-plan dispatch runs
    await adapter.dispatch(msg);
    // Then: fuse() is never called — empty plan skips execution AND fusion
    expect(fuseSpy).not.toHaveBeenCalled();
  });

  // Defense-in-depth: verify normal path still calls execute when capabilities have tools
  it('[P1] normal dispatch path still executes when capabilities have tools — no regression', async () => {
    // Given: a normal mock backend with tools available
    const normalSpy = vi.fn();
    const mockBackend = createMockBackend({
      execute: normalSpy,
    });
    const { BaseAdapter } = await import('../../../src/interface/base-adapter.js');
    const adapter = new BaseAdapter(mockBackend);
    const msg = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
    };
    // When: dispatched with normal capabilities
    const response = await adapter.dispatch(msg);
    // Then: backend.execute WAS called (normal path not broken)
    expect(normalSpy).toHaveBeenCalled();
    // And: response is valid
    expect(response).toHaveProperty('content');
    expect(response.metadata).toBeDefined();
  });
});
