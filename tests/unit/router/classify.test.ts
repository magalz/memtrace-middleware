import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { classify, getRegistry } from '../../../src/router/classify.js';
import { IntentRegistry } from '../../../src/router/types.js';
import type { MemtraceCapabilities } from '../../../src/types.js';

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

function makeToolMessage(tool: string): Record<string, unknown> {
  return {
    method: 'tools/call',
    params: {
      name: tool,
      arguments: { name: 'someFunction', scope: 'callers' },
    },
  };
}

describe('classify', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should classify find_code intent from natural language query', () => {
    const msg = makeMessage(
      'find the function authenticateUser in the auth module',
      'memtrace_find_code'
    );
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('find_code');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  it('should classify get_symbol_context intent from natural language query', () => {
    const msg = makeMessage('what calls the validateToken function', 'memtrace_get_symbol_context');
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_symbol_context');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  it('should classify get_impact intent from natural language query', () => {
    const msg = makeMessage(
      'what is the blast radius of changing processPayment',
      'memtrace_get_impact'
    );
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_impact');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  it('should return passthrough for low-confidence messages', () => {
    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'some random text that does not match any intent' } },
    };
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passthrough).toBe(true);
    expect(result.value.confidence).toBeLessThan(0.95);
  });

  it('should classify from tool name alone when no text content', () => {
    const msg = makeToolMessage('memtrace_get_impact');
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_impact');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  it('should use tool name matching for higher confidence', () => {
    const msg = makeToolMessage('memtrace_get_symbol_context');
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_symbol_context');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('should reject null message with middleware error', () => {
    const result = classify(null as unknown as Record<string, unknown>, mockCapabilities);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  it('should return complete error envelope with all required fields', () => {
    const result = classify(null as unknown as Record<string, unknown>, mockCapabilities);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.tier).toBeDefined();
    expect(result.error.cause).toBe('classification_failed');
    expect(result.error.recoverable).toBe(true);
    expect(result.error.suggested_action).toBeTruthy();
    expect(typeof result.error.suggested_action).toBe('string');
    expect(result.error.trace_id).toBeTruthy();
    expect(typeof result.error.trace_id).toBe('string');
    expect(result.error.trace_id.length).toBe(8);
  });

  it('should handle empty object gracefully as unknown passthrough', () => {
    const result = classify({} as Record<string, unknown>, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('unknown');
    expect(result.value.passthrough).toBe(true);
  });

  it('should return passthrough when confidence is between 0 and threshold', () => {
    getRegistry().register({
      type: 'custom_a',
      patterns: ['shared word'],
      tools: [],
    });
    getRegistry().register({
      type: 'custom_b',
      patterns: ['shared word'],
      tools: [],
    });

    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'shared word query' } },
    };
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passthrough).toBe(true);
    expect(result.value.confidence).toBeLessThan(0.95);
    expect(result.value.confidence).toBeGreaterThan(0);
  });

  it('should preserve original_message reference in return value', () => {
    const msg = makeMessage('find function test', 'memtrace_find_code');
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.original_message).toBe(msg);
  });
});

describe('plugin contract — IntentRegistry', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should register a new intent type without modifying existing ones', () => {
    const registry = new IntentRegistry();
    const beforeCount = registry.list().length;

    registry.register({
      type: 'find_dead_code',
      patterns: ['dead code', 'unused function', 'orphan method'],
      tools: ['memtrace_find_dead_code'],
    });

    const after = registry.list();
    expect(after.length).toBe(beforeCount + 1);
    expect(after.find((d) => d.type === 'find_dead_code')).toBeDefined();
    expect(after.find((d) => d.type === 'find_code')).toBeDefined();
    expect(after.find((d) => d.type === 'get_symbol_context')).toBeDefined();
    expect(after.find((d) => d.type === 'get_impact')).toBeDefined();
  });

  it('should classify newly registered intent type via singleton registry', () => {
    getRegistry().register({
      type: 'find_dead_code',
      patterns: ['dead code', 'unused function'],
      tools: ['memtrace_find_dead_code'],
    });

    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'show me dead code in this function' } },
    };
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('find_dead_code');
  });

  it('should preserve backward compatibility after new registration', () => {
    getRegistry().register({
      type: 'find_dead_code',
      patterns: ['dead code', 'unused function'],
      tools: ['memtrace_find_dead_code'],
    });

    const fcMsg = {
      method: 'tools/call',
      params: { arguments: { query: 'find function authenticateUser' } },
    };
    const fcResult = classify(fcMsg, mockCapabilities);
    expect(fcResult.ok).toBe(true);
    if (!fcResult.ok) return;
    expect(fcResult.value.intent_type).toBe('find_code');

    const impactMsg = {
      method: 'tools/call',
      params: { arguments: { query: 'what is the blast radius of processPayment' } },
    };
    const impactResult = classify(impactMsg, mockCapabilities);
    expect(impactResult.ok).toBe(true);
    if (!impactResult.ok) return;
    expect(impactResult.value.intent_type).toBe('get_impact');
  });

  it('should score high confidenceWeight intent above default-weight intents', () => {
    getRegistry().register({
      type: 'high_priority',
      patterns: ['urgent', 'critical'],
      tools: [],
      confidenceWeight: 5.0,
    });

    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'find function urgent critical fix' } },
    };
    const result = classify(msg, mockCapabilities);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('high_priority');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe('getRegistry', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('should return the singleton registry with 3 default intents', () => {
    const registry = getRegistry();
    const intents = registry.list();
    expect(intents.length).toBeGreaterThanOrEqual(3);
    expect(intents.map((d) => d.type)).toContain('find_code');
    expect(intents.map((d) => d.type)).toContain('get_symbol_context');
    expect(intents.map((d) => d.type)).toContain('get_impact');
  });
});

describe('sample-intents fixture', () => {
  it('should contain valid MCP tool/call payloads for all 3 MVP intents', () => {
    const fixturePath = path.resolve(__dirname, '../../fixtures/sample-intents.json');
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, Record<string, unknown>>;

    expect(fixture.find_code).toBeDefined();
    expect(fixture.get_symbol_context).toBeDefined();
    expect(fixture.get_impact).toBeDefined();
    expect(fixture.ambiguous).toBeDefined();

    const fcParams = fixture.find_code.params as Record<string, unknown>;
    expect(fcParams.name).toBe('memtrace_find_code');

    const gscParams = fixture.get_symbol_context.params as Record<string, unknown>;
    expect(gscParams.name).toBe('memtrace_get_symbol_context');

    const giParams = fixture.get_impact.params as Record<string, unknown>;
    expect(giParams.name).toBe('memtrace_get_impact');
  });
});
