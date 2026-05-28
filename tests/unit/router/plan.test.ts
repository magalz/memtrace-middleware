import { describe, it, expect, beforeEach } from 'vitest';

import { classify, getRegistry, plan } from '../../../src/router/index.js';
import type { ClassifiedIntent, MemtraceCapabilities } from '../../../src/types.js';

const mockCapabilities: MemtraceCapabilities = {
  tools: [
    { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
    { name: 'memtrace_get_symbol_context', description: 'Get symbol context', inputSchema: {} },
    { name: 'memtrace_get_impact', description: 'Get impact', inputSchema: {} },
  ],
};

function makeMessage(text: string, tool?: string): Record<string, unknown> {
  return {
    method: 'tools/call',
    params: {
      name: tool ?? 'memtrace_find_code',
      arguments: { query: text },
    },
  };
}

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

describe('plan — find_code', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should plan a single memtrace_find_code query from a classified find_code intent', () => {
    const classified = classifyAndPlan(
      'find function authenticateUser in auth',
      'memtrace_find_code'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_code');
    expect(result.value[0].arguments).toEqual({ query: 'find function authenticateUser in auth' });

    const args = result.value[0].arguments as Record<string, unknown>;
    expect(typeof args.query).toBe('string');
    expect((args.query as string).length).toBeGreaterThan(0);
  });

  it('should plan a single memtrace_find_code query using name param when no query text', () => {
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { name: 'authenticateUser' } },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].arguments).toEqual({ query: 'authenticateUser' });
  });
});

describe('plan — get_symbol_context', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should plan at least 2 queries for get_symbol_context intent', () => {
    const classified = classifyAndPlan(
      'what calls the validateToken function',
      'memtrace_get_symbol_context'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.length).toBeGreaterThanOrEqual(2);
  });

  it('should include memtrace_get_impact in get_symbol_context queries', () => {
    const classified = classifyAndPlan('context of processPayment', 'memtrace_get_symbol_context');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const toolNames = result.value.map((q) => q.tool);
    expect(toolNames).toContain('memtrace_find_code');
    expect(toolNames).toContain('memtrace_get_symbol_context');
    expect(toolNames).toContain('memtrace_get_impact');
  });

  it('should use correct argument keys: query for find_code, symbol for get_symbol_context, target for get_impact', () => {
    const classified = classifyAndPlan(
      'dependencies of authenticateUser',
      'memtrace_get_symbol_context'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
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

describe('plan — get_impact', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should plan queries with get_impact + find_code for get_impact intent', () => {
    const classified = classifyAndPlan(
      'what is the blast radius of changing processPayment',
      'memtrace_get_impact'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const toolNames = result.value.map((q) => q.tool);
    expect(toolNames).toContain('memtrace_get_impact');
    expect(toolNames).toContain('memtrace_find_code');
  });

  it('should use target argument key for get_impact query', () => {
    const classified = classifyAndPlan('what breaks if I change doPayment', 'memtrace_get_impact');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const impact = result.value.find((q) => q.tool === 'memtrace_get_impact');
    expect(impact).toBeDefined();
    expect(impact!.arguments).toMatchObject({ target: 'what breaks if I change doPayment' });
  });

  it('should use symbol for target when explicit target key in original message', () => {
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

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const impact = result.value.find((q) => q.tool === 'memtrace_get_impact');
    expect(impact!.arguments).toEqual({ target: 'processPayment' });
  });
});

describe('plan — passthrough', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should mirror original tool call when intent has passthrough true', () => {
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

    const result = plan(passthroughIntent, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_dead_code');
    expect(result.value[0].arguments).toEqual({ query: 'search' });
  });

  it('should handle passthrough with missing params gracefully', () => {
    const passthroughIntent: ClassifiedIntent = {
      intent_type: 'unknown',
      confidence: 0.3,
      passthrough: true,
      original_message: {},
    };

    const result = plan(passthroughIntent, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('unknown');
    expect(result.value[0].arguments).toEqual({});
  });
});

describe('plan — unknown intent', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should return passthrough when intent type not in registry', () => {
    const unknownIntent: ClassifiedIntent = {
      intent_type: 'nonexistent_intent',
      confidence: 0.9,
      passthrough: false,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
      },
    };

    const result = plan(unknownIntent, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_code');
  });
});

describe('plan — capabilities validation', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should skip tools not present in capabilities', () => {
    const partialCaps: MemtraceCapabilities = {
      tools: [{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }],
    };

    const classified = classifyAndPlan(
      'dependencies of authenticateUser',
      'memtrace_get_symbol_context'
    );
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, partialCaps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('memtrace_find_code');
  });

  it('should still return queries when capabilities are empty', () => {
    const emptyCaps: MemtraceCapabilities = { tools: [] };

    const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, emptyCaps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('should handle null/undefined capabilities gracefully', () => {
    const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, null as unknown as MemtraceCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });
});

describe('plan — argument extraction correctness', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should extract target from params.arguments.target for get_impact', () => {
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_get_impact', arguments: { target: 'explicitTarget' } },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const impact = result.value.find((q) => q.tool === 'memtrace_get_impact');
    expect(impact!.arguments).toEqual({ target: 'explicitTarget' });
  });

  it('should extract symbol from params.arguments.symbol for get_symbol_context', () => {
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'explicitSymbol' } },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ctx = result.value.find((q) => q.tool === 'memtrace_get_symbol_context');
    expect(ctx).toBeDefined();
    expect(ctx!.arguments).toEqual({ symbol: 'explicitSymbol' });
  });

  it('should fallback to empty string when no arguments present', () => {
    const msg: Record<string, unknown> = {
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: {} },
    };
    const classified = classify(msg, mockCapabilities);
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].arguments).toEqual({ query: '' });
  });

  it('should return correct result shape for all queries', () => {
    const classified = classifyAndPlan('what calls processPayment', 'memtrace_get_symbol_context');
    expect(classified.ok).toBe(true);
    if (!classified.ok) return;

    const result = plan(classified.value, mockCapabilities);
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
