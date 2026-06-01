// AC 7: Three QueryResult payloads with overlapping symbols → deduped, ranked, annotated
// AC 9: Partial results with degraded stub → valid results preserved, partial: true
import { describe, it, expect } from 'vitest';

import { fuse } from '../../../src/fusion/engine.js';
import type { QueryResult } from '../../../src/types.js';

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    tool: 'memtrace_find_code',
    data: [],
    trace_id: 'test-001',
    elapsed_ms: 15,
    degraded: false,
    ...overrides,
  };
}

function makeSymbol(
  name: string,
  filePath: string,
  startLine = 1,
  endLine = 10,
  centrality = 0
): Record<string, unknown> {
  return { name, file_path: filePath, start_line: startLine, end_line: endLine, centrality };
}

describe('fuse() — fusion engine', () => {
  // AC 7 — dedup
  it('[P0] deduplicates overlapping symbols across query results', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [makeSymbol('authenticateUser', 'src/auth.ts', 42, 58, 5)],
      }),
      makeResult({
        tool: 'memtrace_get_symbol_context',
        data: { callers: [makeSymbol('authenticateUser', 'src/auth.ts', 42, 58, 8)] },
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_symbol_context' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(1);
    expect(fused.value.blocks[0].symbol).toBe('authenticateUser');
    expect(fused.value.blocks[0].centrality).toBe(8);
    expect(fused.value.partial).toBe(false);
  });

  // AC 7 — ranking
  it('[P0] ranks blocks by centrality descending', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [
          makeSymbol('fnA', 'src/a.ts', 1, 10, 3),
          makeSymbol('fnB', 'src/b.ts', 1, 10, 15),
          makeSymbol('fnC', 'src/c.ts', 1, 10, 8),
        ],
      }),
    ];

    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(3);
    expect(fused.value.blocks[0].symbol).toBe('fnB');
    expect(fused.value.blocks[1].symbol).toBe('fnC');
    expect(fused.value.blocks[2].symbol).toBe('fnA');
  });

  // AC 7 — annotation
  it('[P0] annotates each block with provenance string', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [makeSymbol('authUser', 'src/auth.ts', 42, 58, 5)],
      }),
    ];

    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.provenance).toHaveLength(1);
    expect(fused.value.provenance[0]).toBe(
      '[memtrace: grounded via memtrace_find_code → authUser at src/auth.ts:42]'
    );
  });

  // AC 7 — different symbols from different queries
  it('[P0] includes all unique symbols from multiple queries', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [makeSymbol('fnA', 'src/a.ts', 1, 10, 5)],
      }),
      makeResult({
        tool: 'memtrace_get_symbol_context',
        data: {
          callers: [makeSymbol('fnB', 'src/b.ts', 5, 15, 10)],
          callees: [makeSymbol('fnC', 'src/c.ts', 8, 12, 2)],
        },
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_symbol_context' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(3);
    const symbols = fused.value.blocks.map((b) => b.symbol).sort();
    expect(symbols).toEqual(['fnA', 'fnB', 'fnC']);
  });

  // AC 7 — data as single object (not array)
  it('[P0] extracts block from single-object QueryResult data', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_get_impact',
        data: makeSymbol('validateSession', 'src/session.ts', 88, 102, 15),
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_impact' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(1);
    expect(fused.value.blocks[0].symbol).toBe('validateSession');
    expect(fused.value.blocks[0].file_path).toBe('src/session.ts');
  });

  // AC 9 — partial results
  it('[P0] preserves valid results when one sub-query produces degraded stub', () => {
    const results: QueryResult[] = [
      makeResult({ tool: 'memtrace_find_code', data: [makeSymbol('fnA', 'src/a.ts', 1, 10, 5)] }),
      makeResult({ tool: 'memtrace_get_impact', data: [makeSymbol('fnB', 'src/b.ts', 5, 15, 8)] }),
      makeResult({
        tool: 'memtrace_get_symbol_context',
        data: null,
        degraded: true,
        trace_id: 'timeout-001',
        elapsed_ms: 250,
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_impact' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.partial).toBe(true);
    expect(fused.value.blocks).toHaveLength(2);
    expect(fused.value.provenance).toHaveLength(2);
  });

  // AC 9 — all degraded
  it('[P0] returns empty blocks when all results are degraded', () => {
    const results: QueryResult[] = [
      makeResult({ tool: 'memtrace_find_code', data: null, degraded: true }),
      makeResult({ tool: 'memtrace_get_impact', data: null, degraded: true }),
    ];

    const fused = fuse({ results, intent_type: 'get_impact' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.partial).toBe(true);
    expect(fused.value.blocks).toHaveLength(0);
  });

  // Empty results
  it('[P1] returns empty FusedContext for empty results array', () => {
    const fused = fuse({ results: [], intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(0);
    expect(fused.value.partial).toBe(false);
    expect(fused.value.trace_id).toBe('');
  });

  // Primitive data
  it('[P1] gracefully skips primitive data values', () => {
    const results: QueryResult[] = [
      makeResult({ tool: 'memtrace_find_code', data: [makeSymbol('fnA', 'src/a.ts', 1, 10, 5)] }),
      makeResult({ tool: 'probe', data: 'pong' }),
      makeResult({ tool: 'count', data: 42 }),
    ];

    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(1);
    expect(fused.value.blocks[0].symbol).toBe('fnA');
  });

  // Data with `symbol` field instead of `name`
  it('[P1] extracts symbol from `.symbol` field when `.name` is absent', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_get_impact',
        data: {
          affected_symbols: [
            {
              symbol: 'myFunc',
              file_path: 'src/func.ts',
              start_line: 5,
              end_line: 10,
              centrality: 3,
            },
          ],
        },
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_impact' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(1);
    expect(fused.value.blocks[0].symbol).toBe('myFunc');
  });

  // Duplicate with data as array vs object (different query_type)
  it('[P1] keeps highest centrality on duplicate symbol+file+start_line', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [makeSymbol('dup', 'src/dup.ts', 10, 20, 2)],
      }),
      makeResult({
        tool: 'memtrace_get_impact',
        data: [makeSymbol('dup', 'src/dup.ts', 10, 20, 7)],
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_impact' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(1);
    expect(fused.value.blocks[0].centrality).toBe(7);
    expect(fused.value.blocks[0].query_type).toBe('memtrace_get_impact');
  });

  // NULL data — EDGE
  it('[P2] handles null data gracefully', () => {
    const results: QueryResult[] = [
      makeResult({ tool: 'memtrace_find_code', data: null, trace_id: 'null-1' }),
    ];

    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(0);
    expect(fused.value.partial).toBe(false);
  });

  // Provenance count matches blocks
  it('[P2] generates provenance for each block', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [
          makeSymbol('a', 'a.ts', 1, 10, 1),
          makeSymbol('b', 'b.ts', 1, 10, 2),
          makeSymbol('c', 'c.ts', 1, 10, 3),
        ],
      }),
    ];

    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.provenance).toHaveLength(3);
  });
});

describe('fuse — review_code AST review patterns', () => {
  it('[P0] annotates AST review results with pattern type, severity, file path, and line number in FusedContext provenance', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'find_ast_review_issues',
        data: [
          {
            name: 'null-deref-check',
            file_path: 'src/auth/middleware.ts',
            start_line: 42,
            end_line: 45,
            centrality: 9,
            pattern_type: 'null_safety',
            severity: 'high',
            message: 'Potential null dereference at line 42',
          },
          {
            name: 'unhandled-error',
            file_path: 'src/auth/middleware.ts',
            start_line: 67,
            end_line: 67,
            centrality: 7,
            pattern_type: 'error_handling',
            severity: 'medium',
            message: 'Unhandled promise rejection on async call',
          },
        ],
      }),
    ];
    const fused = fuse({ results, intent_type: 'review_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;
    expect(fused.value.blocks.length).toBeGreaterThanOrEqual(1);
    for (const block of fused.value.blocks) {
      expect(block.file_path).toBeTruthy();
      expect(block.start_line).toBeGreaterThan(0);
    }
    expect(fused.value.provenance.length).toBeGreaterThanOrEqual(1);
  });

  it('[P1] preserves pattern metadata within block data for review_code fusion', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'find_ast_review_issues',
        data: [
          {
            name: 'hardcoded-secret',
            file_path: 'src/config/secrets.ts',
            start_line: 5,
            end_line: 5,
            centrality: 10,
            pattern_type: 'security',
            severity: 'critical',
            message: 'Hardcoded API key detected',
          },
        ],
      }),
    ];
    const fused = fuse({ results, intent_type: 'review_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;
    expect(fused.value.blocks).toHaveLength(1);
    expect(fused.value.blocks[0].symbol).toBe('hardcoded-secret');
    expect(fused.value.blocks[0].file_path).toBe('src/config/secrets.ts');
    expect(fused.value.blocks[0].start_line).toBe(5);
  });
});

describe('fuse — get_style_fingerprint style patterns', () => {
  it('[P0] includes style pattern results in FusedContext as descriptive metadata via provenance', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'get_style_fingerprint',
        data: [
          {
            name: 'ternary-vs-ifelse',
            file_path: 'src/patterns.ts',
            start_line: 1,
            end_line: 1,
            centrality: 8,
            style_pattern: 'ternary',
            usage_percent: 72,
            description: 'Ternary expressions preferred over if/else',
          },
          {
            name: 'arrow-vs-function',
            file_path: 'src/patterns.ts',
            start_line: 1,
            end_line: 1,
            centrality: 6,
            style_pattern: 'arrow_function',
            usage_percent: 91,
            description: 'Arrow functions dominate for callbacks',
          },
        ],
      }),
    ];
    const fused = fuse({ results, intent_type: 'get_style_fingerprint' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;
    expect(fused.value.blocks.length).toBeGreaterThanOrEqual(1);
    expect(fused.value.provenance.length).toBeGreaterThanOrEqual(1);
    for (const p of fused.value.provenance) {
      expect(p).toContain('get_style_fingerprint');
    }
  });

  it('[P1] style fingerprint results are descriptive — never prescriptive', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'get_style_fingerprint',
        data: [
          {
            name: 'indent-style',
            file_path: 'src/patterns.ts',
            start_line: 1,
            end_line: 1,
            centrality: 5,
            style_pattern: 'spaces',
            usage_percent: 100,
            description: '2-space indentation used across all TypeScript files',
          },
        ],
      }),
    ];
    const fused = fuse({ results, intent_type: 'get_style_fingerprint' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;
    for (const p of fused.value.provenance) {
      expect(p).toContain('get_style_fingerprint');
      expect(p).toMatch(/^\[memtrace: grounded via/);
    }
  });
});
