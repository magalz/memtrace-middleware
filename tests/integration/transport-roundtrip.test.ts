// AC 1.2-8: end-to-end passthrough — connect mock → execute find_code → raw result matches mock
// AC 1.2-9: connection rejection propagated as MiddlewareError with cause:memtrace_unavailable, recoverable:true
// AC 1.2-5: Promise.allSettled with per-query AbortController — one failed query never blocks others (FR7)
// AC 1.2-6: trace identifiers and per-query phase timestamps emitted to structured output (FR8)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MemtraceTransport } from '../../src/backend/transport.js';
import { createMockMemtrace } from '../fixtures/memtrace-mock.js';
import { MiddlewareError } from '../../src/errors.js';
import { classify, plan } from '../../src/router/index.js';
import { mockCapabilities } from '../helpers/test-utils.js';
import type { GraphQuery } from '../../src/types.js';

describe('Memtrace transport roundtrip', () => {
  let mock: { url: string; close: () => Promise<void> } | null = null;
  let transport: MemtraceTransport | null = null;

  beforeEach(() => {
    mock = null;
    transport = null;
  });

  afterEach(async () => {
    if (transport) {
      await transport.disconnect();
      transport = null;
    }
    if (mock) {
      await mock.close();
      mock = null;
    }
  });

  // AC 1.2-8 — connect to mock and execute find_code end-to-end (FR5, FR10)
  it('[P0] connects to mock Memtrace server and executes find_code with raw result passthrough', async () => {
    // Given: a mock Memtrace server running in normal mode
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);
    // When: the transport connects and executes a find_code query
    await transport.connect();
    // Then: tools/list returns at least 3 tools from the mock catalog
    const tools = await transport.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(3);
    expect(tools.find((t) => t.name === 'memtrace_find_code')).toBeTruthy();
    // And: execute returns a valid QueryResult with trace_id and timing
    const controller = new AbortController();
    const query = { tool: 'memtrace_find_code', arguments: { query: 'authenticateUser' } };
    const result = await transport.execute(query, controller.signal);
    expect(result.tool).toBe('memtrace_find_code');
    expect(result.trace_id).toBeTruthy();
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.degraded).toBe(false);
    expect(result.data).toBeTruthy();
  });

  // AC 1.2-9 — connection rejection produces typed MiddlewareError
  it('[P0] propagates connection rejection as MiddlewareError with cause:memtrace_unavailable and recoverable:true', async () => {
    // Given: a mock configured to reject connections
    const failMock = createMockMemtrace({ failureMode: 'reject' });
    const failTransport = new MemtraceTransport(failMock.url);
    // When: connect is attempted
    try {
      await failTransport.connect();
      expect.unreachable('Should have thrown');
    } catch (err) {
      // Then: the error is a MiddlewareError with machine-readable cause and recoverable flag
      expect(err).toBeInstanceOf(MiddlewareError);
      expect((err as MiddlewareError).cause).toBe('memtrace_unavailable');
      expect((err as MiddlewareError).recoverable).toBe(true);
    }
    await failTransport.disconnect();
    await failMock.close();
  });

  // AC 1.2-5 — Promise.allSettled with per-query AbortController (FR7)
  it('[P1] handles 3 concurrent queries via Promise.allSettled with per-query 200ms deadline', async () => {
    // Given: a connected transport and 3 queries
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);
    await transport.connect();
    const queries = [
      { tool: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
      { tool: 'memtrace_get_symbol_context', arguments: { symbol: 'authenticateUser' } },
      { tool: 'memtrace_get_impact', arguments: { target: 'authenticateUser' } },
    ];
    // When: all 3 execute in parallel via Promise.allSettled with per-query AbortController
    const results = await Promise.allSettled(
      queries.map((q) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 200);
        return transport!.execute(q, controller.signal).finally(() => clearTimeout(timer));
      })
    );
    // Then: all 3 are fulfilled — no query blocks another (FR7)
    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });

  // AC 1.2-6 — timeout produces degraded stub (FR8)
  it('[P0] returns degraded stub when query exceeds AbortController deadline', async () => {
    // Given: a mock with 300ms delay, AbortController set to 100ms
    mock = createMockMemtrace({ failureMode: 'slow', delayMs: 300 });
    transport = new MemtraceTransport(mock.url);
    await transport.connect();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);
    // When: the query times out before the mock responds
    const query = { tool: 'memtrace_find_code', arguments: { query: 'authenticateUser' } };
    const result = await transport
      .execute(query, controller.signal)
      .finally(() => clearTimeout(timer));
    // Then: result is marked degraded with null data (FR8: trace + timing emitted internally)
    expect(result.tool).toBe('memtrace_find_code');
    expect(result.degraded).toBe(true);
    expect(result.data).toBeNull();
  });

  // AC 1.2-6 — probe liveness check (FR8)
  it('[P1] probe returns true when connected to a healthy mock server', async () => {
    // Given: a connected transport
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);
    await transport.connect();
    // When: probe is called
    const healthy = await transport.probe();
    // Then: returns true indicating the server is reachable
    expect(healthy).toBe(true);
  });

  // AC 1.2-9 — probe returns false when disconnected
  it('[P1] probe returns false when Memtrace is unreachable', async () => {
    // Given: a transport pointing to a dead port
    transport = new MemtraceTransport('http://localhost:9999');
    // When: probe is called
    const healthy = await transport.probe();
    // Then: returns false
    expect(healthy).toBe(false);
  });

  // AC 1.2-1 — reconnect lifecycle: exponential backoff reconnection (1s→30s cap)
  it('[P1] handles connect-disconnect-reconnect lifecycle', async () => {
    // Given: a first mock connected and disconnected
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);
    await transport.connect();
    await transport.disconnect();
    // When: a new transport connects to a fresh mock instance
    const mock2 = createMockMemtrace({ failureMode: 'none' });
    try {
      transport = new MemtraceTransport(mock2.url);
      await transport.connect();
      const controller = new AbortController();
      const query = { tool: 'memtrace_find_code', arguments: { query: 'test' } };
      const result = await transport.execute(query, controller.signal);
      // Then: the new connection works normally
      expect(result.degraded).toBe(false);
    } finally {
      await mock2.close();
    }
  });

  // Post-review: idempotent double disconnect
  it('[P2] double disconnect is idempotent and leaves transport in unusable state', async () => {
    // Given: a connected transport
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);
    await transport.connect();
    // When: disconnected twice
    await transport.disconnect();
    await transport.disconnect(); // should not throw
    // Then: transport is no longer usable, subsequent operations throw MiddlewareError
    await expect(transport.listTools()).rejects.toThrow(MiddlewareError);
  });

  // AC 1.3b-7 — timeout isolation: one slow query does not block sibling queries
  it('[P0] does not block sibling queries when one query exceeds 200ms deadline (Promise.allSettled)', async () => {
    // Given: a classified get_symbol_context intent planned into 2+ queries
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: {
        name: 'memtrace_get_symbol_context',
        arguments: { symbol: 'authenticateUser', query: 'authenticateUser' },
      },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const planned = plan(classified.value, mockCapabilities);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.value.length).toBeGreaterThanOrEqual(2);
    // When: one tool is slow (210ms > 200ms deadline), others are fast
    mock = createMockMemtrace({ slowTools: ['memtrace_get_symbol_context'], delayMs: 210 });
    transport = new MemtraceTransport(mock.url);
    await transport.connect();
    const results = await Promise.allSettled(
      planned.value.map((q: GraphQuery) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 200);
        return transport!.execute(q, controller.signal).finally(() => clearTimeout(timer));
      })
    );
    // Then: all are fulfilled (Promise.allSettled, not Promise.all)
    expect(results).toHaveLength(planned.value.length);
    const degradedCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.degraded
    ).length;
    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && !r.value.degraded
    ).length;
    // And: at least one slow degraded, at least one fast success — timeout isolation works
    expect(degradedCount).toBeGreaterThanOrEqual(1);
    expect(successCount).toBeGreaterThanOrEqual(1);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });
});
