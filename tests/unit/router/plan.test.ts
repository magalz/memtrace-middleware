// AC 1.3b-2: plan() decomposes ClassifiedIntent into GraphQuery[] targeting appropriate Memtrace tools (FR6)
// AC 1.3b-3: queries passed to Promise.allSettled with per-query AbortController (orchestrator in Story 1.4)
// AC 1.3b-4: plan step validates tools via MemtraceCapabilities DI, never imports src/backend/
// AC 1.3b-5: find_code → single memtrace_find_code query with correct arguments
// AC 1.3b-6: get_symbol_context → at least 2 queries with correct tools
import { describe, it, expect, beforeEach } from 'vitest';

import { classify, getRegistry, plan } from '../../../src/router/index.js';
import type { ClassifiedIntent, MemtraceCapabilities } from '../../../src/types.js';
import { mockCapabilities, makeMessage } from '../../helpers/test-utils.js';

function classifyAndPlan(
  text: string,
  tool?: string,
  caps: MemtraceCapabilities = mockCapabilities
): { ok: boolean; value?: ClassifiedIntent } {
  const msg = makeMessage(text, tool);
  const result = classify(msg, caps);
  if (!result.ok) return { ok: false };
  return { ok: true, value: result.value };
}

// AC 1.3b-5 — find_code intent plans a single memtrace_find_code query with correct args
describe('plan — find_code', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] plans a single memtrace_find_code query from a classified find_code intent', () => {
    // Given: a classified find_code intent with query text
    const classified = classifyAndPlan(
      'find function authenticateUser in auth',
      'memtrace_find_code'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Then: exactly 1 query targeting memtrace_find_code with the query text
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_code');
    expect(result.value[0].arguments).toEqual({ query: 'find function authenticateUser in auth' });
    const args = result.value[0].arguments as Record<string, unknown>;
    expect(typeof args.query).toBe('string');
    expect((args.query as string).length).toBeGreaterThan(0);
  });

  // AC 1.3b-5 — name param fallback when no query text
  it('[P2] plans find_code using name param when no query text is present', () => {
    // Given: a message with only a name parameter, no query
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { name: 'authenticateUser' } },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: the name value is used as the query argument
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].arguments).toEqual({ query: 'authenticateUser' });
  });
});

// AC 1.3b-6 — get_symbol_context decomposes into find_code + get_symbol_context + get_impact
describe('plan — get_symbol_context', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] plans at least 2 queries for get_symbol_context intent', () => {
    // Given: a classified get_symbol_context intent
    const classified = classifyAndPlan(
      'what calls the validateToken function',
      'memtrace_get_symbol_context'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: at least 2 queries are produced (FR6)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(2);
  });

  it('[P0] includes memtrace_get_impact in get_symbol_context query plan', () => {
    // Given: a classified get_symbol_context intent
    const classified = classifyAndPlan('context of processPayment', 'memtrace_get_symbol_context');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: the plan includes find_code, get_symbol_context, AND get_impact
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const toolNames = result.value.map((q) => q.tool);
    expect(toolNames).toContain('memtrace_find_code');
    expect(toolNames).toContain('memtrace_get_symbol_context');
    expect(toolNames).toContain('memtrace_get_impact');
  });

  it('[P1] uses correct argument keys per tool type in plan output', () => {
    // Given: a classified get_symbol_context intent with query text
    const classified = classifyAndPlan(
      'dependencies of authenticateUser',
      'memtrace_get_symbol_context'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: each tool has the correct argument key (query→find_code, symbol→context, target→impact)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const byTool = new Map(result.value.map((q) => [q.tool, q.arguments]));
    expect(byTool.get('memtrace_find_code')).toMatchObject({
      query: 'dependencies of authenticateUser',
    });
    expect(byTool.get('memtrace_get_symbol_context')).toMatchObject({
      symbol: 'dependencies of authenticateUser',
    });
    expect(byTool.get('memtrace_get_impact')).toMatchObject({
      target: 'dependencies of authenticateUser',
    });
  });
});

// AC 1.3b-2 — get_impact intent decomposes into get_impact + find_code
describe('plan — get_impact', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] plans queries with get_impact + find_code for get_impact intent', () => {
    // Given: a classified get_impact intent
    const classified = classifyAndPlan(
      'what is the blast radius of changing processPayment',
      'memtrace_get_impact'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: the plan includes both get_impact and find_code queries
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const toolNames = result.value.map((q) => q.tool);
    expect(toolNames).toContain('memtrace_get_impact');
    expect(toolNames).toContain('memtrace_find_code');
  });

  it('[P1] uses target argument key for the get_impact query', () => {
    // Given: a classified get_impact intent
    const classified = classifyAndPlan('what breaks if I change doPayment', 'memtrace_get_impact');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: the get_impact query uses the target argument key
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const impact = result.value.find((q) => q.tool === 'memtrace_get_impact');
    expect(impact).toBeDefined();
    expect(impact!.arguments).toMatchObject({ target: 'what breaks if I change doPayment' });
  });

  it('[P2] uses explicit target key from original message arguments', () => {
    // Given: a message with an explicit target key in arguments
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: {
        name: 'memtrace_get_impact',
        arguments: { target: 'processPayment', query: 'unused' },
      },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, mockCapabilities);
    // Then: the explicit target value is used, not the query text
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const impact = result.value.find((q) => q.tool === 'memtrace_get_impact');
    expect(impact!.arguments).toEqual({ target: 'processPayment' });
  });
});

// AC 1.3b-3 — passthrough intents mirror original MCP tool call exactly
describe('plan — passthrough', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P1] mirrors the original tool call exactly when intent has passthrough:true', () => {
    // Given: a passthrough ClassifiedIntent with original tool call data
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_find_dead_code', arguments: { query: 'search' } },
    };
    const passthroughIntent: ClassifiedIntent = {
      intent_type: 'unknown',
      confidence: 0.3,
      passthrough: true,
      original_message: msg,
    };
    // When: plan() is called
    const result = plan(passthroughIntent, mockCapabilities);
    // Then: exactly 1 query, tool name + arguments preserved unchanged
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_dead_code');
    expect(result.value[0].arguments).toEqual({ query: 'search' });
  });

  it('[P2] handles passthrough with missing params gracefully', () => {
    // Given: a passthrough intent with an empty original_message
    const passthroughIntent: ClassifiedIntent = {
      intent_type: 'unknown',
      confidence: 0.3,
      passthrough: true,
      original_message: {},
    };
    // When: plan() is called
    const result = plan(passthroughIntent, mockCapabilities);
    // Then: produces a single query with defaults, never errors
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('unknown');
    expect(result.value[0].arguments).toEqual({});
  });
});

// AC 1.3b-2 — unknown intent types passthrough or error
describe('plan — unknown intent', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P1] returns passthrough query from original message when intent type is not in registry', () => {
    // Given: a ClassifiedIntent with a type not registered anywhere
    const unknownIntent: ClassifiedIntent = {
      intent_type: 'nonexistent_intent',
      confidence: 0.9,
      passthrough: false,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
      },
    };
    // When: plan() is called
    const result = plan(unknownIntent, mockCapabilities);
    // Then: falls back to passthrough, forwarding the original tool call
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_code');
  });
});

// AC 1.3b-4 — tool validation via MemtraceCapabilities DI, skip missing tools
describe('plan — capabilities validation', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P1] skips tools not present in capabilities and logs a warning', () => {
    // Given: capabilities with only find_code (get_symbol_context + get_impact missing)
    const partialCaps: MemtraceCapabilities = {
      tools: [{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }],
    };
    const classified = classifyAndPlan(
      'dependencies of authenticateUser',
      'memtrace_get_symbol_context'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called with partial capabilities
    const result = plan(classified.value, partialCaps);
    // Then: only find_code query produced; other tools skipped with warning
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_code');
  });

  it('[P2] returns empty query array when capabilities are empty', () => {
    // Given: empty capabilities (no tools available)
    const emptyCaps: MemtraceCapabilities = { tools: [] };
    const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called
    const result = plan(classified.value, emptyCaps);
    // Then: produces empty array, never errors
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('[P2] handles null/undefined capabilities gracefully', () => {
    // Given: null capabilities
    const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called with null caps
    const result = plan(classified.value, null as unknown as MemtraceCapabilities);
    // Then: produces empty array, never errors
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });
});

// AC 1.3b-2 — argument extraction correctness verified
describe('plan — argument extraction correctness', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P1] extracts target argument key for get_impact from params.arguments.target', () => {
    // Given: a get_impact message with explicit target
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_get_impact', arguments: { target: 'explicitTarget' } },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() extracts arguments
    const result = plan(classified.value, mockCapabilities);
    // Then: the target key is used correctly
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const impact = result.value.find((q) => q.tool === 'memtrace_get_impact');
    expect(impact!.arguments).toEqual({ target: 'explicitTarget' });
  });

  it('[P1] extracts symbol argument key for get_symbol_context from params.arguments.symbol', () => {
    // Given: a get_symbol_context message with explicit symbol
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'explicitSymbol' } },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() extracts arguments
    const result = plan(classified.value, mockCapabilities);
    // Then: the symbol key is used correctly
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ctx = result.value.find((q) => q.tool === 'memtrace_get_symbol_context');
    expect(ctx).toBeDefined();
    expect(ctx!.arguments).toEqual({ symbol: 'explicitSymbol' });
  });

  it('[P2] falls back to empty string when no arguments are present', () => {
    // Given: a message with empty arguments object
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: {} },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() extracts arguments
    const result = plan(classified.value, mockCapabilities);
    // Then: empty string fallback used, never errors
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].arguments).toEqual({ query: '' });
  });

  it('[P2] produces correct GraphQuery result shape for all queries', () => {
    // Given: a classified get_symbol_context intent
    const classified = classifyAndPlan('what calls processPayment', 'memtrace_get_symbol_context');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() produces the query array
    const result = plan(classified.value, mockCapabilities);
    // Then: every query has non-empty tool string and non-null plain object arguments
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const q of result.value) {
      expect(typeof q.tool).toBe('string');
      expect(q.tool.length).toBeGreaterThan(0);
      expect(typeof q.arguments).toBe('object');
      expect(q.arguments).not.toBeNull();
    }
  });
});
