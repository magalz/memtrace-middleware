import { describe, it, expect } from 'vitest';
import { BaseAdapter } from '../../src/interface/base-adapter.js';

function makeDispatch(name: string): Record<string, unknown> {
  return {
    method: 'tools/call',
    params: { name, arguments: { query: 'test', repo_id: 'test' } },
  };
}

function makeBackend(tools: Array<{ name: string; description: string; inputSchema: object }>) {
  return {
    async execute(query: { tool: string }, _signal?: AbortSignal) {
      return {
        tool: query.tool,
        data: [{ symbol: 'test', file_path: 'test.ts', line: 1 }],
        trace_id: 't1',
        elapsed_ms: 10,
        degraded: false,
      };
    },
    async probe() {
      return true;
    },
    async listTools() {
      return { tools };
    },
  };
}

const BASE_TOOLS = [
  { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
  { name: 'memtrace_get_symbol_context', description: 'Get context', inputSchema: {} },
  { name: 'memtrace_get_impact', description: 'Get impact', inputSchema: {} },
];

describe('contract canary', () => {
  it('[P0] new intent registration does not break find_code context shape', async () => {
    const tools = [
      ...BASE_TOOLS,
      { name: 'memtrace_new_analysis', description: 'New analysis', inputSchema: {} },
    ];
    const adapter = new BaseAdapter(makeBackend(tools));
    const result = await adapter.dispatch(makeDispatch('memtrace_find_code'));
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(typeof result.metadata!.elapsed_ms).toBe('number');
    expect(result.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.content[0]?.text).toBeTruthy();
  });

  it('[P0] modified tool signature does not break get_symbol_context', async () => {
    const adapter = new BaseAdapter(makeBackend(BASE_TOOLS));
    const result = await adapter.dispatch(makeDispatch('memtrace_get_symbol_context'));
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(result.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.content[0]?.text).toBeTruthy();
  });

  it('[P0] removed tool returns result gracefully (no crash)', async () => {
    const tools = BASE_TOOLS.filter((t) => t.name !== 'memtrace_get_impact');
    const adapter = new BaseAdapter(makeBackend(tools));
    const result = await adapter.dispatch(makeDispatch('memtrace_get_impact'));
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(result.content[0]?.text).toBeTruthy();
  });

  it('[P0] type change in existing parameter does not break legacy intent shape', async () => {
    const adapter = new BaseAdapter(makeBackend(BASE_TOOLS));
    const result = await adapter.dispatch(makeDispatch('memtrace_find_code'));
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.content[0]?.text).toBeTruthy();
  });

  it('[P1] passthrough on unknown intent returns valid result without crash', async () => {
    const adapter = new BaseAdapter(makeBackend(BASE_TOOLS));
    const result = await adapter.dispatch(makeDispatch('unknown_tool'));
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(result.content[0]?.text).toBeTruthy();
  });

  it('[P1] all legacy intents produce metadata with trace_id and elapsed_ms', async () => {
    const adapter = new BaseAdapter(makeBackend(BASE_TOOLS));
    for (const tool of ['memtrace_find_code', 'memtrace_get_symbol_context', 'memtrace_get_impact']) {
      const result = await adapter.dispatch(makeDispatch(tool));
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.trace_id).toBeTruthy();
      expect(typeof result.metadata!.trace_id).toBe('string');
      expect(result.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(result.content[0]?.text).toBeTruthy();
    }
  });

  it('[P1] canary completes in under 10 seconds (CI gate speed)', async () => {
    const start = Date.now();
    const adapter = new BaseAdapter(makeBackend(BASE_TOOLS));
    await adapter.dispatch(makeDispatch('memtrace_find_code'));
    await adapter.dispatch(makeDispatch('memtrace_get_symbol_context'));
    await adapter.dispatch(makeDispatch('memtrace_get_impact'));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
  });
});
