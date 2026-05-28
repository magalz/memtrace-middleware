import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { MemtraceTransport } from '../../src/backend/transport.js';
import { createMockMemtrace } from '../fixtures/memtrace-mock.js';
import { MiddlewareError } from '../../src/errors.js';
import { classify, plan } from '../../src/router/index.js';
import type { MemtraceCapabilities, GraphQuery } from '../../src/types.js';

const mockCapabilities: MemtraceCapabilities = {
  tools: [
    { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
    { name: 'memtrace_get_symbol_context', description: 'Get symbol context', inputSchema: {} },
    { name: 'memtrace_get_impact', description: 'Get impact', inputSchema: {} },
  ],
};

describe('Memtrace passthrough roundtrip', () => {
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

  it('should connect to mock and execute find_code', async () => {
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);

    await transport.connect();

    const tools = await transport.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(3);
    expect(tools.find((t) => t.name === 'memtrace_find_code')).toBeTruthy();

    const controller = new AbortController();
    const query = { tool: 'memtrace_find_code', arguments: { query: 'authenticateUser' } };
    const result = await transport.execute(query, controller.signal);

    expect(result.tool).toBe('memtrace_find_code');
    expect(result.trace_id).toBeTruthy();
    expect(result.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.degraded).toBe(false);
    expect(result.data).toBeTruthy();
  });

  it('should propagate connection error as MiddlewareError', async () => {
    const failMock = createMockMemtrace({ failureMode: 'reject' });
    const failTransport = new MemtraceTransport(failMock.url);

    try {
      await failTransport.connect();
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(MiddlewareError);
      expect((err as MiddlewareError).cause).toBe('memtrace_unavailable');
      expect((err as MiddlewareError).recoverable).toBe(true);
    }

    await failTransport.disconnect();
    await failMock.close();
  });

  it('should handle concurrent queries', async () => {
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);

    await transport.connect();

    const queries = [
      { tool: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
      { tool: 'memtrace_get_symbol_context', arguments: { symbol: 'authenticateUser' } },
      { tool: 'memtrace_get_impact', arguments: { target: 'authenticateUser' } },
    ];

    const results = await Promise.allSettled(
      queries.map((q) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 200);
        return transport!.execute(q, controller.signal).finally(() => clearTimeout(timer));
      })
    );

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });

  it('should return degraded stub when query times out', async () => {
    mock = createMockMemtrace({ failureMode: 'slow', delayMs: 300 });
    transport = new MemtraceTransport(mock.url);

    await transport.connect();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 100);

    const query = { tool: 'memtrace_find_code', arguments: { query: 'authenticateUser' } };
    const result = await transport
      .execute(query, controller.signal)
      .finally(() => clearTimeout(timer));

    expect(result.tool).toBe('memtrace_find_code');
    expect(result.degraded).toBe(true);
    expect(result.data).toBeNull();
  });

  it('should probe successfully when connected', async () => {
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);

    await transport.connect();

    const healthy = await transport.probe();
    expect(healthy).toBe(true);
  });

  it('should return false from probe when disconnected', async () => {
    transport = new MemtraceTransport('http://localhost:9999');

    const healthy = await transport.probe();
    expect(healthy).toBe(false);
  });

  it('should handle connect-disconnect-reconnect lifecycle', async () => {
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);

    await transport.connect();
    await transport.disconnect();

    // reconnect to a new mock
    const mock2 = createMockMemtrace({ failureMode: 'none' });
    try {
      transport = new MemtraceTransport(mock2.url);
      await transport.connect();

      const controller = new AbortController();
      const query = { tool: 'memtrace_find_code', arguments: { query: 'test' } };
      const result = await transport.execute(query, controller.signal);

      expect(result.degraded).toBe(false);
    } finally {
      await mock2.close();
    }
  });

  it('should be idempotent on double disconnect', async () => {
    mock = createMockMemtrace({ failureMode: 'none' });
    transport = new MemtraceTransport(mock.url);

    await transport.connect();
    await transport.disconnect();
    await transport.disconnect(); // should not throw

    // verify transport is no longer usable
    await expect(transport.listTools()).rejects.toThrow(MiddlewareError);
  });

  it('should not block sibling queries when one query exceeds timeout', async () => {
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

    expect(results).toHaveLength(planned.value.length);

    const degradedCount = results.filter(
      (r) => r.status === 'fulfilled' && r.value.degraded
    ).length;
    const successCount = results.filter(
      (r) => r.status === 'fulfilled' && !r.value.degraded
    ).length;

    expect(degradedCount).toBeGreaterThanOrEqual(1);
    expect(successCount).toBeGreaterThanOrEqual(1);

    for (const r of results) {
      expect(r.status).toBe('fulfilled');
    }
  });
});
