import { describe, it, expect, beforeEach } from 'vitest';
import { BaseAdapter } from '../../src/interface/base-adapter.js';
import { degradationMachine } from '../../src/degrade/index.js';
import { metrics } from '../../src/telemetry/index.js';
import { resetColdStartDetector } from '../../src/telemetry/cold-start.js';
import type { MemtraceBackend } from '../../src/backend/trait.js';
import type { GraphQuery, QueryResult } from '../../src/types.js';

function createE2EMockBackend(opts: {
  probeFails: boolean;
  queryDelayMs: number;
}): MemtraceBackend {
  return {
    async execute(query: GraphQuery, _signal?: AbortSignal): Promise<QueryResult> {
      if (opts.queryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, opts.queryDelayMs));
      }
      return {
        tool: query.tool,
        data: [{ symbol: 'test', file_path: 'test.ts', line: 1 }],
        trace_id: 't1',
        elapsed_ms: 10,
        degraded: false,
      };
    },
    async probe(): Promise<boolean> {
      return !opts.probeFails;
    },
    async listTools() {
      return {
        tools: [{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }],
      };
    },
  };
}

beforeEach(() => {
  degradationMachine.reset();
  metrics.reset();
  resetColdStartDetector();
});

describe('e2e full pipeline', () => {
  it('[P0] healthy scenario produces correct FusedContext shape with trace_id and elapsed_ms', async () => {
    const backend = createE2EMockBackend({ probeFails: false, queryDelayMs: 0 });
    const adapter = new BaseAdapter(backend);
    const result = await adapter.dispatch({
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'auth', repo_id: 'test' } },
    });
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(typeof result.metadata!.trace_id).toBe('string');
    expect(result.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.content[0]?.text).toBeTruthy();
    expect(result.content[0]?.type).toBe('text');
    expect(typeof result.content[0].text).toBe('string');
  });

  it('[P1] degraded scenario handles probe failures gracefully', async () => {
    const backend = createE2EMockBackend({ probeFails: true, queryDelayMs: 0 });
    const adapter = new BaseAdapter(backend);
    const result = await adapter.dispatch({
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'auth', repo_id: 'test' } },
    });
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
  });

  it('[P1] dispatches review_code message gracefully when find_ast_review_issues absent from backend', async () => {
    const backend = createE2EMockBackend({ probeFails: false, queryDelayMs: 0 });
    const adapter = new BaseAdapter(backend);
    const result = await adapter.dispatch({
      method: 'tools/call',
      params: { name: 'find_ast_review_issues', arguments: { query: 'review auth middleware' } },
    });
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(result.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.content[0]?.text).toBeTruthy();
  });

  it('[P1] dispatches get_style_fingerprint message gracefully when tool absent from backend', async () => {
    const backend = createE2EMockBackend({ probeFails: false, queryDelayMs: 0 });
    const adapter = new BaseAdapter(backend);
    const result = await adapter.dispatch({
      method: 'tools/call',
      params: { name: 'get_style_fingerprint', arguments: { lang: 'typescript' } },
    });
    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.metadata!.trace_id).toBeTruthy();
    expect(result.metadata!.elapsed_ms).toBeGreaterThanOrEqual(0);
    expect(result.content[0]?.text).toBeTruthy();
  });
});
