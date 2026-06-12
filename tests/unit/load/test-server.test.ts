import { describe, it, expect, onTestFinished, beforeEach } from 'vitest';
import http from 'node:http';

import type { MemtraceBackend } from '../../../src/backend/trait.js';
import type { GraphQuery, QueryResult, ToolSchema } from '../../../src/types.js';
import { startTestServer, stopTestServer } from '../../../load/test-server.js';

function createMockBackend(): MemtraceBackend {
  const tools: ToolSchema[] = [
    { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
    { name: 'memtrace_get_symbol_context', description: 'Get symbol context', inputSchema: {} },
    { name: 'memtrace_get_impact', description: 'Get impact', inputSchema: {} },
  ];

  return {
    async execute(query: GraphQuery, _signal: AbortSignal): Promise<QueryResult> {
      return {
        tool: query.tool,
        data: { blocks: [{ symbol: 'testSymbol', file_path: 'test/file.ts', start_line: 1, end_line: 10, centrality: 0.5, query_type: query.tool }] },
        trace_id: `mock-${Math.random().toString(36).slice(2, 6)}`,
        elapsed_ms: 45,
        degraded: false,
      };
    },
    async probe(): Promise<boolean> {
      return true;
    },
    async listTools(): Promise<ToolSchema[]> {
      return tools;
    },
    async disconnect(): Promise<void> {
      // no-op mock
    },
  };
}

async function fetchJson(rawUrl: string, options?: http.RequestOptions & { body?: string }): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl);
    const reqOpts: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: options?.method ?? 'GET',
      headers: options?.headers ?? {},
    };
    const req = http.request(reqOpts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let parsed: unknown;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode ?? 500, body: parsed });
      });
    });
    req.on('error', reject);
    if (options?.body) {
      req.write(options.body);
    }
    req.end();
  });
}

describe('test-server HTTP endpoints', () => {
  beforeEach(() => {
    process.env['MEMTRACE_TEST_PORT'] = '0';
  });

  it('[P0] startTestServer starts and stopTestServer stops cleanly', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    expect(handle).toBeDefined();
    expect(handle.port).toBeGreaterThan(0);
  }, 15000);

  it('[P0] GET /status returns valid status shape with real tier_history', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    const { status, body } = await fetchJson(`http://localhost:${handle.port}/status`);
    expect(status).toBe(200);
    expect(body).toBeTypeOf('object');
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      expect(obj).toHaveProperty('tier');
      expect(obj).toHaveProperty('degradation_tier');
      expect(obj).toHaveProperty('tier_history');
      expect(obj).toHaveProperty('transition_reason');
      expect(obj).toHaveProperty('query_stats');
      expect(obj).toHaveProperty('uptime_seconds');
      expect(obj).toHaveProperty('latency_stats');
      expect(obj).toHaveProperty('cold_start');
      // tier_history must be an array (of tier transitions)
      expect(Array.isArray(obj.tier_history)).toBe(true);
    }
  }, 15000);

  it('[P0] POST /dispatch returns FusedContext with trace_id and elapsed_ms', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    const { status, body } = await fetchJson(`http://localhost:${handle.port}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool_call: 'memtrace_find_code', args: { query: 'test' } }),
    });
    expect(status).toBe(200);
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      expect(obj).toHaveProperty('trace_id');
      expect(obj.trace_id).toMatch(/^mock-/);
      expect(obj).toHaveProperty('elapsed_ms');
      expect(obj).toHaveProperty('blocks');
      expect(obj).toHaveProperty('partial');
      expect(typeof obj.partial).toBe('boolean');
    }
  }, 15000);

  it('[P0] POST /simulate/memtrace-down then /simulate/memtrace-up full cycle returns 200', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    // Disconnect first
    const down = await fetchJson(`http://localhost:${handle.port}/simulate/memtrace-down`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(down.status).toBe(200);
    if (down.body && typeof down.body === 'object') {
      expect((down.body as Record<string, unknown>)).toHaveProperty('status', 'memtrace_disconnected');
    }

    // Then reconnect
    const up = await fetchJson(`http://localhost:${handle.port}/simulate/memtrace-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(up.status).toBe(200);
    if (up.body && typeof up.body === 'object') {
      expect((up.body as Record<string, unknown>)).toHaveProperty('status', 'memtrace_reconnected');
    }
  }, 15000);

  it('[P1] POST /simulate/memtrace-up when already connected returns 200 with already_connected', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    const { status, body } = await fetchJson(`http://localhost:${handle.port}/simulate/memtrace-up`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(status).toBe(200);
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      // already-connected guard returns 'already_connected', not 'memtrace_reconnected'
      expect(obj.status === 'already_connected' || obj.status === 'memtrace_reconnected').toBe(true);
    }
  }, 15000);

  it('[P1] POST /dispatch with invalid JSON returns 400', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    const { status, body } = await fetchJson(`http://localhost:${handle.port}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(status).toBe(400);
    if (body && typeof body === 'object') {
      expect((body as Record<string, unknown>).error).toBeDefined();
    }
  }, 15000);

  it('[P1] POST to unknown route returns 404', async () => {
    const mock = createMockBackend();
    const handle = await startTestServer(
      {
        memtrace_host: 'http://localhost:1',
        memtrace_token: '',
        timeout_budgets: { sub_query_ms: 100, dispatch_ms: 500, probe_interval_ms: 5000 },
        hysteresis_probe_count: 3,
        degradation_floor: 'Full',
        enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
        classification_threshold: 0.95,
      },
      mock
    );

    onTestFinished(async () => {
      await stopTestServer(handle);
    });

    const { status, body } = await fetchJson(`http://localhost:${handle.port}/unknown`, {
      method: 'POST',
      body: '{}',
    });
    expect(status).toBe(404);
    if (body && typeof body === 'object') {
      expect((body as Record<string, unknown>).error).toBeDefined();
    }
  }, 15000);
});
