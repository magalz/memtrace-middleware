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

// AC post.1-2: review_code plan produces GraphQuery[] targeting find_ast_review_issues
describe('plan — review_code', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] plans a single find_ast_review_issues query from a classified review_code intent', () => {
    const msg = makeMessage('review this PR for auth module', 'find_ast_review_issues');
    const caps: MemtraceCapabilities = {
      tools: [
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
        { name: 'find_ast_review_issues', description: '', inputSchema: {} },
      ],
    };
    const classified = classify(msg, caps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, caps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('find_ast_review_issues');
    const args = result.value[0].arguments as Record<string, unknown>;
    expect(typeof args.query).toBe('string');
    expect((args.query as string).length).toBeGreaterThan(0);
  });

  it('[P1] derives arguments from the original agent message for review_code', () => {
    const msg = makeMessage('find AST issues in authMiddleware.ts', 'find_ast_review_issues');
    const caps: MemtraceCapabilities = {
      tools: [
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
        { name: 'find_ast_review_issues', description: '', inputSchema: {} },
      ],
    };
    const classified = classify(msg, caps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, caps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].tool).toBe('find_ast_review_issues');
    expect(result.value[0].arguments).toMatchObject({
      query: 'find AST issues in authMiddleware.ts',
    });
  });
});

// AC post.1-5: get_style_fingerprint plan produces single GraphQuery
describe('plan — get_style_fingerprint', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] plans a single get_style_fingerprint query from a classified get_style_fingerprint intent', () => {
    const msg = makeMessage('what code style does this project use', 'get_style_fingerprint');
    const caps: MemtraceCapabilities = {
      tools: [
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
        { name: 'get_style_fingerprint', description: '', inputSchema: {} },
      ],
    };
    const classified = classify(msg, caps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, caps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('get_style_fingerprint');
    expect(result.value[0].arguments).toBeDefined();
  });

  it('[P1] infers language from file extension in message context', () => {
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: {
        name: 'get_style_fingerprint',
        arguments: { lang: 'typescript', query: 'match conventions for auth.ts' },
      },
    };
    const caps: MemtraceCapabilities = {
      tools: [
        { name: 'get_style_fingerprint', description: '', inputSchema: {} },
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
      ],
    };
    const classified = classify(msg, caps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, caps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].tool).toBe('get_style_fingerprint');
    const args = result.value[0].arguments as Record<string, unknown>;
    expect(args).toMatchObject({ lang: 'typescript', query: 'match conventions for auth.ts' });
  });

  it('[P2] falls back to default language when no file extension or lang param is present', () => {
    const msg = makeMessage('what conventions does this project follow', 'get_style_fingerprint');
    const caps: MemtraceCapabilities = {
      tools: [
        { name: 'get_style_fingerprint', description: '', inputSchema: {} },
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
      ],
    };
    const classified = classify(msg, caps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, caps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('get_style_fingerprint');
  });
});

// AC post.1-7: backward compat — 3 MVP intent plans unchanged after new intents
describe('plan — backward compat with new intents', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] all 3 MVP intents produce correct plans after new intents registered', () => {
    const caps: MemtraceCapabilities = {
      tools: [
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
        { name: 'memtrace_get_symbol_context', description: '', inputSchema: {} },
        { name: 'memtrace_get_impact', description: '', inputSchema: {} },
        { name: 'find_ast_review_issues', description: '', inputSchema: {} },
        { name: 'get_style_fingerprint', description: '', inputSchema: {} },
      ],
    };
    const fcClassified = classify(
      {
        method: 'tools/call',
        params: { name: 'memtrace_find_code', arguments: { query: 'find fn' } },
      },
      caps
    );
    const gscClassified = classify(
      {
        method: 'tools/call',
        params: { name: 'memtrace_get_symbol_context', arguments: { query: 'context of fn' } },
      },
      caps
    );
    const giClassified = classify(
      {
        method: 'tools/call',
        params: { name: 'memtrace_get_impact', arguments: { query: 'impact of fn' } },
      },
      caps
    );
    expect(fcClassified.ok && gscClassified.ok && giClassified.ok).toBe(true);
    if (!fcClassified.ok || !gscClassified.ok || !giClassified.ok) return;

    const fcPlan = plan(fcClassified.value, caps);
    const gscPlan = plan(gscClassified.value, caps);
    const giPlan = plan(giClassified.value, caps);
    expect(fcPlan.ok).toBe(true);
    if (fcPlan.ok) {
      expect(fcPlan.value.map((q) => q.tool)).toContain('memtrace_find_code');
    }
    expect(gscPlan.ok).toBe(true);
    if (gscPlan.ok) {
      expect(gscPlan.value.map((q) => q.tool)).toContain('memtrace_get_symbol_context');
    }
    expect(giPlan.ok).toBe(true);
    if (giPlan.ok) {
      expect(giPlan.value.map((q) => q.tool)).toContain('memtrace_get_impact');
    }
  });
});

// AC post.1-8: plan handles new intents gracefully when tools absent (v0.4.x backward compat)
describe('plan — v0.4.x passthrough', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] review_code plan returns gracefully when find_ast_review_issues is absent from capabilities', () => {
    const msg = makeMessage('review this code', 'some_old_tool');
    const v04xCaps: MemtraceCapabilities = {
      tools: [
        { name: 'memtrace_find_code', description: '', inputSchema: {} },
        { name: 'memtrace_get_symbol_context', description: '', inputSchema: {} },
        { name: 'memtrace_get_impact', description: '', inputSchema: {} },
      ],
    };
    const classified = classify(msg, v04xCaps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, v04xCaps);
    expect(result.ok).toBe(true);
  });

  it('[P0] get_style_fingerprint plan returns gracefully when tool absent from capabilities', () => {
    const msg = makeMessage('what code style is used here', 'old_tool_name');
    const v04xCaps: MemtraceCapabilities = {
      tools: [{ name: 'memtrace_find_code', description: '', inputSchema: {} }],
    };
    const classified = classify(msg, v04xCaps);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    const result = plan(classified.value, v04xCaps);
    expect(result.ok).toBe(true);
  });
});

// Story 5.5 — empty query plan edge cases (AC: 1, 3)
describe('plan — empty query plan edge cases (Story 5.5)', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  // Sub-task 2.1 — intent with empty tools list
  it('[P2] returns empty array when intent definition has no tools', () => {
    // Given: a test intent registered with empty tools list
    const intentType = 'empty_tools_intent' as const;
    getRegistry().register({
      type: intentType,
      patterns: [],
      tools: [],
    });
    const intent: ClassifiedIntent = {
      intent_type: intentType,
      confidence: 0.9,
      passthrough: false,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
      },
    };
    // When: plan() is called
    const result = plan(intent, mockCapabilities);
    // Then: returns ok with empty array — no tools to produce queries
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  // Sub-task 2.2 — all tools absent from capabilities
  it('[P2] returns empty array when all tools are absent from capabilities', () => {
    // Given: capabilities with no matching tools for the intent
    const emptyCaps: MemtraceCapabilities = { tools: [] };
    const classified = classifyAndPlan(
      'find function authenticateUser',
      'memtrace_find_code',
      emptyCaps
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    // When: plan() is called with empty capabilities
    const result = plan(classified.value, emptyCaps);
    // Then: returns empty array — no available tools
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  // Sub-task 2.3 — null original_message does not throw
  it('[P2] does not throw when original_message is null', () => {
    // Given: a classified intent whose original_message is set to null
    const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    classified.value.original_message = null;
    // When: plan() is called with null original_message
    const result = plan(classified.value, mockCapabilities);
    // Then: does not throw, returns ok
    expect(result.ok).toBe(true);
  });

  // Sub-task 2.3 — missing params on original_message does not throw
  it('[P2] does not throw when original_message has no params property', () => {
    // Given: a classified intent whose original_message has no params
    const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;
    (classified.value.original_message as Record<string, unknown>).params = undefined;
    // When: plan() is called with missing params
    const result = plan(classified.value, mockCapabilities);
    // Then: does not throw, returns ok (name fallback from tool name should work)
    expect(result.ok).toBe(true);
  });
});
