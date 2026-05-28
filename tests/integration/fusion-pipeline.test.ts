// AC 1,2,3,5,6 — full pipeline fusion integration: classify → plan → execute → fuse → provenance
import { describe, it, expect } from 'vitest';

import { fuse } from '../../src/fusion/engine.js';
import { validateContext } from '../../src/fusion/validate.js';
import type { QueryResult } from '../../src/types.js';

function makeResult(overrides: Partial<QueryResult> = {}): QueryResult {
  return {
    tool: 'memtrace_find_code',
    data: [],
    trace_id: 'int-001',
    elapsed_ms: 10,
    degraded: false,
    ...overrides,
  };
}

describe('fusion pipeline integration', () => {
  it('[P0] find_code intent produces fused context with provenance annotations', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [
          {
            name: 'authenticateUser',
            file_path: 'src/auth.ts',
            start_line: 42,
            end_line: 58,
            kind: 'Function',
            centrality: 5,
          },
        ],
      }),
    ];

    // Step: fuse
    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    // Step: validate
    const validated = validateContext(fused.value);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // Verify provenance
    expect(validated.value.blocks).toHaveLength(1);
    expect(validated.value.provenance).toHaveLength(1);
    expect(validated.value.provenance[0]).toContain(
      '[memtrace: grounded via memtrace_find_code → authenticateUser at src/auth.ts:42]'
    );
  });

  it('[P0] get_symbol_context with callers + callees produces merged deduplicated blocks', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_get_symbol_context',
        data: {
          symbol: 'processPayment',
          callers: [
            { name: 'checkout', file_path: 'src/checkout.ts', start_line: 142, centrality: 8 },
            {
              name: 'subscription',
              file_path: 'src/subscription.ts',
              start_line: 88,
              centrality: 5,
            },
          ],
          callees: [
            {
              name: 'paymentMiddleware',
              file_path: 'src/payment.ts',
              start_line: 33,
              centrality: 3,
            },
          ],
        },
      }),
      makeResult({
        tool: 'memtrace_get_impact',
        data: {
          affected_symbols: [
            { name: 'checkout', file_path: 'src/checkout.ts', start_line: 142, centrality: 10 },
          ],
        },
      }),
    ];

    const fused = fuse({ results, intent_type: 'get_symbol_context' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    expect(fused.value.blocks).toHaveLength(3);
    expect(fused.value.partial).toBe(false);

    // Dedup: checkout appears in both results, but fused only once (higher centrality wins)
    const checkoutBlocks = fused.value.blocks.filter(
      (b) => b.symbol === 'checkout' && b.file_path === 'src/checkout.ts'
    );
    expect(checkoutBlocks).toHaveLength(1);
    expect(checkoutBlocks[0].centrality).toBe(10);
  });

  it('[P1] partial results with slow mock produce partial: true with valid results preserved', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [{ name: 'fnA', file_path: 'src/a.ts', start_line: 1, end_line: 10, centrality: 3 }],
      }),
      makeResult({
        tool: 'memtrace_get_symbol_context',
        data: [{ name: 'fnB', file_path: 'src/b.ts', start_line: 5, end_line: 15, centrality: 6 }],
      }),
      makeResult({
        tool: 'memtrace_get_impact',
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
    const validated = validateContext(fused.value);
    expect(validated.ok).toBe(true);
  });

  it('[P2] nominal roundtrip — fuse then validate — for partial with provenance', () => {
    const results: QueryResult[] = [
      makeResult({
        tool: 'memtrace_find_code',
        data: [
          { name: 'foo', file_path: 'src/foo.ts', start_line: 5, end_line: 15, centrality: 2 },
          { name: 'bar', file_path: 'src/bar.ts', start_line: 20, end_line: 30, centrality: 4 },
          { name: 'baz', file_path: 'src/baz.ts', start_line: 0, end_line: 50, centrality: 6 },
        ],
      }),
    ];

    const fused = fuse({ results, intent_type: 'find_code' });
    expect(fused.ok).toBe(true);
    if (!fused.ok) return;

    const validated = validateContext(fused.value);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    // Ranking: bar > baz > foo by centrality
    expect(validated.value.blocks).toHaveLength(3);
    expect(validated.value.blocks[0].symbol).toBe('baz');
    expect(validated.value.blocks[1].symbol).toBe('bar');
    expect(validated.value.blocks[2].symbol).toBe('foo');

    // Provenance matches count
    expect(validated.value.provenance).toHaveLength(3);
  });
});
