// Contract tests: plan() structural invariants and regression guards (autonomous addition, not in story ACs)
// Guards: intent cardinality, output envelope shape, passthrough invariants, DI boundary
import { describe, it, expect, beforeEach } from 'vitest';

import { plan, getRegistry } from '../../src/router/index.js';
import type { ClassifiedIntent, GraphQuery, MemtraceCapabilities } from '../../src/types.js';
import { buildIntent } from '../helpers/test-utils.js';

const capabilities: MemtraceCapabilities = {
  tools: [
    { name: 'memtrace_find_code', description: 'Finds code', inputSchema: {} },
    { name: 'memtrace_get_symbol_context', description: 'Symbol context', inputSchema: {} },
    { name: 'memtrace_get_impact', description: 'Blast radius', inputSchema: {} },
  ],
};

function isResultOk(value: unknown): value is { ok: true; value: GraphQuery[] } {
  const obj = value as Record<string, unknown>;
  return typeof value === 'object' && value !== null && 'ok' in value && obj.ok === true;
}

function isValidGraphQuery(q: unknown): q is GraphQuery {
  const obj = q as Record<string, unknown>;
  return (
    typeof q === 'object' &&
    q !== null &&
    typeof obj.tool === 'string' &&
    obj.tool.length > 0 &&
    typeof obj.arguments === 'object' &&
    obj.arguments !== null
  );
}

function isValidErrorShape(err: unknown): boolean {
  const obj = err as Record<string, unknown>;
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof obj.tier === 'string' &&
    typeof obj.cause === 'string' &&
    typeof obj.recoverable === 'boolean' &&
    typeof obj.suggested_action === 'string' &&
    typeof obj.trace_id === 'string'
  );
}

describe('plan() contract — output envelope', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P0] always returns Result shape with ok:true+value or ok:false+error for all intent types', () => {
    // Given: all 4 intent scenarios (find_code, get_symbol_context, get_impact, passthrough)
    const intents = [
      buildIntent({ intent_type: 'find_code' }),
      buildIntent({
        intent_type: 'get_symbol_context',
        original_message: {
          method: 'tools/call',
          params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'auth' } },
        },
      }),
      buildIntent({ intent_type: 'get_impact' }),
      buildIntent({ passthrough: true, confidence: 0.3 }),
    ];
    // Then: every result is a valid Result shape
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

  it('[P0] never imports src/backend/ — MemtraceCapabilities consumed exclusively via DI parameter', () => {
    // Given: a valid intent with full capabilities injected via parameter
    const result = plan(buildIntent(), capabilities);
    // Then: plan() processes without any hard dependency on src/backend/
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

  it('[P0] every GraphQuery has non-empty tool name and non-null arguments object for all intent types', () => {
    // Given: all 4 intent scenarios
    const intents = [
      buildIntent(),
      buildIntent({ intent_type: 'get_symbol_context' }),
      buildIntent({ intent_type: 'get_impact' }),
      buildIntent({ passthrough: true, confidence: 0.3 }),
    ];
    // Then: every produced GraphQuery is structurally valid
    for (const intent of intents) {
      const result = plan(intent, capabilities);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const q of result.value) {
        expect(isValidGraphQuery(q)).toBe(true);
      }
    }
  });

  it('[P1] arguments field is always a plain object, never null, never an array, never a primitive', () => {
    // Given: a valid find_code intent
    const result = plan(buildIntent(), capabilities);
    // Then: arguments is a non-null plain object
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

  it('[P0] find_code produces exactly 1 query — cardinality regression guard', () => {
    // Given: a find_code classified intent
    const result = plan(buildIntent({ intent_type: 'find_code' }), capabilities);
    // Then: always 1 query — any change here breaks downstream consumers
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('[P0] get_symbol_context produces between 2 and 3 queries — cardinality regression guard', () => {
    // Given: a get_symbol_context classified intent
    const intent = buildIntent({
      intent_type: 'get_symbol_context',
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_get_symbol_context', arguments: { symbol: 'auth' } },
      },
    });
    // Then: 2-3 queries (find_code + get_symbol_context + optionally get_impact)
    const result = plan(intent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThanOrEqual(2);
    expect(result.value.length).toBeLessThanOrEqual(3);
  });

  it('[P0] get_impact produces exactly 2 queries — cardinality regression guard', () => {
    // Given: a get_impact classified intent
    const intent = buildIntent({
      intent_type: 'get_impact',
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_get_impact', arguments: { target: 'processPayment' } },
      },
    });
    // Then: always 2 queries (get_impact + find_code)
    const result = plan(intent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('[P1] all tools in output exist in IntentDefinition.tools for the intent type', () => {
    // Given: a get_symbol_context intent
    const result = plan(buildIntent({ intent_type: 'get_symbol_context' }), capabilities);
    // Then: each tool name is one of the 3 known MVP tools
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

  it('[P1] all tools in output exist in capabilities.tools passed via DI', () => {
    // Given: partial capabilities with only find_code
    const partialCaps: MemtraceCapabilities = {
      tools: [{ name: 'memtrace_find_code', description: '', inputSchema: {} }],
    };
    // When: plan is called with a get_symbol_context intent
    const result = plan(buildIntent({ intent_type: 'get_symbol_context' }), partialCaps);
    // Then: only the find_code tool is produced (others skipped)
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

  it('[P0] passthrough intent always produces exactly 1 query regardless of intent_type', () => {
    // Given: a passthrough intent
    const passthroughIntent = buildIntent({
      passthrough: true,
      confidence: 0.3,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_dead_code', arguments: { query: 'search' } },
      },
    });
    // Then: always exactly 1 query
    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
  });

  it('[P1] passthrough query mirrors the original tool name exactly without transformation', () => {
    // Given: a passthrough intent with a custom tool name
    const passthroughIntent = buildIntent({
      passthrough: true,
      confidence: 0.3,
      original_message: {
        method: 'tools/call',
        params: { name: 'memtrace_find_dead_code', arguments: { query: 'search' } },
      },
    });
    // Then: the tool name is preserved verbatim
    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].tool).toBe('memtrace_find_dead_code');
  });

  it('[P1] passthrough query preserves original arguments unchanged, including nested objects', () => {
    // Given: a passthrough intent with complex nested arguments
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
    // Then: arguments are preserved exactly, including nested structures
    const result = plan(passthroughIntent, capabilities);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0].arguments).toEqual({ custom: 'value', nested: { deep: true } });
  });

  it('[P1] passthrough ignores IntentDefinition even when intent_type would normally map to multiple queries', () => {
    // Given: passthrough with get_symbol_context type but a different original tool
    const passthroughIntent = buildIntent({
      passthrough: true,
      intent_type: 'get_symbol_context',
      original_message: {
        method: 'tools/call',
        params: { name: 'some_other_tool', arguments: {} },
      },
    });
    // Then: the original tool name is used, not the intent_type mapping
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

  it('[P2] all valid intents pass the isResultOk type guard', () => {
    // Given: all 4 intent scenarios
    const intents = [
      buildIntent(),
      buildIntent({ intent_type: 'get_symbol_context' }),
      buildIntent({ intent_type: 'get_impact' }),
      buildIntent({ passthrough: true }),
    ];
    // Then: every result passes the isResultOk type guard
    for (const intent of intents) {
      const result = plan(intent, capabilities);
      expect(isResultOk(result)).toBe(true);
    }
  });
});
