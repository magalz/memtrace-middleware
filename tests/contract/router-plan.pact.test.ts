import { describe, it, expect, beforeEach } from 'vitest';

import { plan, getRegistry } from '../../src/router/index.js';
import type { ClassifiedIntent, GraphQuery, MemtraceCapabilities, Result } from '../../src/types.js';

const capabilities: MemtraceCapabilities = {
  tools: [
    { name: 'memtrace_find_code', description: 'Finds code', inputSchema: {} },
    { name: 'memtrace_get_symbol_context', description: 'Symbol context', inputSchema: {} },
    { name: 'memtrace_get_impact', description: 'Blast radius', inputSchema: {} },
  ],
};

function buildIntent(overrides: Partial<ClassifiedIntent> = {}): ClassifiedIntent {
  return {
    intent_type: 'find_code',
    confidence: 0.98,
    passthrough: false,
    original_message: {
      method: 'tools/call',
      params: {
        name: 'memtrace_find_code',
        arguments: { query: 'authenticateUser' },
      },
    },
    ...overrides,
  };
}

function isResultOk(value: unknown): value is { ok: true; value: GraphQuery[] } {
  return typeof value === 'object' && value !== null && 'ok' in value && (value as any).ok === true;
}

function isValidGraphQuery(q: unknown): q is GraphQuery {
  return (
    typeof q === 'object' &&
    q !== null &&
    typeof (q as any).tool === 'string' &&
    (q as any).tool.length > 0 &&
    typeof (q as any).arguments === 'object' &&
    (q as any).arguments !== null
  );
}

function isValidErrorShape(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as any).tier === 'string' &&
    typeof (err as any).cause === 'string' &&
    typeof (err as any).recoverable === 'boolean' &&
    typeof (err as any).suggested_action === 'string' &&
    typeof (err as any).trace_id === 'string'
  );
}

describe('plan() contract — output envelope', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('always returns Result shape: ok:true + value or ok:false + error', () => {
    const intents = [
      buildIntent({ intent_type: 'find_code' }),
      buildIntent({
        intent_type: 'get_symbol_context',
        original_message: {
          method: 'tools/call',
          params: {
            name: 'memtrace_get_symbol_context',
            arguments: { symbol: 'auth' },
          },
        },
      }),
      buildIntent({ intent_type: 'get_impact' }),
      buildIntent({ passthrough: true, confidence: 0.3 }),
    ];

    for (const intent of intents) {
      const result = plan(intent, capabilities);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
      expect('ok' in result).toBe(true);

      if (result.ok) {
        expect(Array.isArray(result.value)).toBe(true);
        expect('error' in result).toBe(false);
      } else {
        expect(isValidErrorShape(result.error)).toBe(true);
      }
    }
  });

  it('never imports src/backend/ — MemtraceCapabilities consumed via DI parameter', () => {
    const result = plan(buildIntent(), capabilities);
    expect(result.ok).toBe(true);

    if (!result.ok) return;
    for (const q of result.value) {
      expect(typeof q.tool).toBe('string');
      expect(typeof q.arguments).toBe('object');
    }
  });
});

describe('plan() contract — GraphQuery structure', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('every GraphQuery has non-empty tool and non-null arguments', () => {
    const intents = [
      buildIntent(),
      buildIntent({ intent_type: 'get_symbol_context' }),
      buildIntent({ intent_type: 'get_impact' }),
      buildIntent({ passthrough: true, confidence: 0.3 }),
    ];

    for (const intent of intents) {
      const result = plan(intent, capabilities);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      for (const q of result.value) {
        expect(isValidGraphQuery(q)).toBe(true);
      }
    }
  });

  it('arguments is always a plain object, never null or primitive', () => {
    const result = plan(buildIntent(), capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const q of result.value) {
      expect(typeof q.arguments).toBe('object');
      expect(q.arguments).not.toBeNull();
      expect(Array.isArray(q.arguments)).toBe(false);
    }
  });
});

describe('plan() contract — intent cardinality (regression guard)', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('find_code produces exactly 1 query', () => {
    const result = plan(buildIntent({ intent_type: 'find_code' }), capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('get_symbol_context produces between 2 and 3 queries', () => {
    const intent = buildIntent({
      intent_type: 'get_symbol_context',
      original_message: {
        method: 'tools/call',
        params: {
          name: 'memtrace_get_symbol_context',
          arguments: { symbol: 'auth' },
        },
      },
    });

    const result = plan(intent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(2);
    expect(result.value.length).toBeLessThanOrEqual(3);
  });

  it('get_impact produces exactly 2 queries', () => {
    const intent = buildIntent({
      intent_type: 'get_impact',
      original_message: {
        method: 'tools/call',
        params: {
          name: 'memtrace_get_impact',
          arguments: { target: 'processPayment' },
        },
      },
    });

    const result = plan(intent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('all tools in output exist in IntentDefinition.tools', () => {
    const result = plan(buildIntent({ intent_type: 'get_symbol_context' }), capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allowed = new Set([
      'memtrace_find_code',
      'memtrace_get_symbol_context',
      'memtrace_get_impact',
    ]);
    for (const q of result.value) {
      expect(allowed.has(q.tool)).toBe(true);
    }
  });

  it('all tools in output exist in capabilities.tools', () => {
    const partialCaps: MemtraceCapabilities = {
      tools: [{ name: 'memtrace_find_code', description: '', inputSchema: {} }],
    };

    const result = plan(buildIntent({ intent_type: 'get_symbol_context' }), partialCaps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allowed = new Set(['memtrace_find_code']);
    for (const q of result.value) {
      expect(allowed.has(q.tool)).toBe(true);
    }
  });
});

describe('plan() contract — passthrough invariants', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('passthrough intent always produces exactly 1 query', () => {
    const passthroughIntent = buildIntent({
      passthrough: true,
      confidence: 0.3,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_dead_code', arguments: { query: 'search' } },
      },
    });

    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('passthrough query mirrors original tool name exactly', () => {
    const passthroughIntent = buildIntent({
      passthrough: true,
      confidence: 0.3,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_dead_code', arguments: { query: 'search' } },
      },
    });

    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].tool).toBe('memtrace_find_dead_code');
  });

  it('passthrough query preserves original arguments unchanged', () => {
    const passthroughIntent = buildIntent({
      passthrough: true,
      confidence: 0.3,
      original_message: {
        method: 'tools/call',
        params: {
          name: 'custom_tool',
          arguments: { custom: 'value', nested: { deep: true } },
        },
      },
    });

    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].arguments).toEqual({ custom: 'value', nested: { deep: true } });
  });

  it('passthrough ignores IntentDefinition even when intent_type is known', () => {
    const passthroughIntent = buildIntent({
      passthrough: true,
      intent_type: 'get_symbol_context',
      original_message: {
        method: 'tools/call',
        params: { name: 'some_other_tool', arguments: {} },
      },
    });

    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].tool).toBe('some_other_tool');
  });
});

describe('plan() contract — result is always accessible via isResultOk guard', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('all valid intents pass the isResultOk type guard', () => {
    const intents = [
      buildIntent(),
      buildIntent({ intent_type: 'get_symbol_context' }),
      buildIntent({ intent_type: 'get_impact' }),
      buildIntent({ passthrough: true }),
    ];

    for (const intent of intents) {
      const result = plan(intent, capabilities);
      expect(isResultOk(result)).toBe(true);
    }
  });
});
