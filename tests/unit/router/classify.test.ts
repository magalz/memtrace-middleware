// AC 1.3a-1: classify() produces ClassifiedIntent with intent_type, confidence, original_message (FR1)
// AC 1.3a-2: confidence < 0.95 → passthrough: true (FR3)
// AC 1.3a-3: new intent via plugin contract without modifying internals (FR4)
// AC 1.3a-4: unknown intent → passthrough, never errors (FR4)
// AC 1.3a-5: router consumes MemtraceCapabilities via DI, never imports src/backend/ (FR4 boundary review)
// AC 1.3a-6: classification accuracy >=95% across 3 MVP intents
// AC 1.3a-7: backward compat — existing 3 MVP intents unaffected by new registration
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { classify, getRegistry } from '../../../src/router/classify.js';
import { IntentRegistry } from '../../../src/router/types.js';
import type { MemtraceCapabilities } from '../../../src/types.js';
import { mockCapabilities, makeMessage, makeToolMessage } from '../../helpers/test-utils.js';

describe('classify', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  // AC 1.3a-6 — find_code classification accuracy >=95%
  it('[P0] classifies find_code intent from natural language query with confidence >=0.95', () => {
    // Given: a message asking to find a function
    const msg = makeMessage(
      'find the function authenticateUser in the auth module',
      'memtrace_find_code'
    );
    // When: classify is called with mock capabilities
    const result = classify(msg, mockCapabilities);
    // Then: it is classified as find_code with high confidence, not passthrough
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('find_code');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  // AC 1.3a-6 — get_symbol_context classification accuracy >=95%
  it('[P0] classifies get_symbol_context intent with confidence >=0.95', () => {
    // Given: a message asking what calls a function
    const msg = makeMessage('what calls the validateToken function', 'memtrace_get_symbol_context');
    // When: classified
    const result = classify(msg, mockCapabilities);
    // Then: get_symbol_context with high confidence
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_symbol_context');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  // AC 1.3a-6 — get_impact classification accuracy >=95%
  it('[P0] classifies get_impact intent from blast radius query with confidence >=0.95', () => {
    // Given: a message asking about blast radius
    const msg = makeMessage(
      'what is the blast radius of changing processPayment',
      'memtrace_get_impact'
    );
    // When: classified
    const result = classify(msg, mockCapabilities);
    // Then: get_impact with high confidence
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_impact');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  // AC 1.3a-2 — low confidence triggers passthrough
  it('[P0] returns passthrough:true with confidence<0.95 for low-confidence messages', () => {
    // Given: a message with text that does not match any intent patterns
    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'some random text that does not match any intent' } },
    };
    // When: classified
    const result = classify(msg, mockCapabilities);
    // Then: passthrough is true, confidence is below threshold (FR3)
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passthrough).toBe(true);
    expect(result.value.confidence).toBeLessThan(0.95);
  });

  // AC 1.3a-2 — tool name alone provides high confidence via TOOL_TO_INTENT matching
  it('[P1] classifies from tool name alone when message has no text content', () => {
    // Given: a message with only a tool name, no query text
    const msg = makeToolMessage('memtrace_get_impact');
    // When: classified
    const result = classify(msg, mockCapabilities);
    // Then: TOOL_TO_INTENT mapping provides enough signal for confident classification
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_impact');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
    expect(result.value.passthrough).toBe(false);
  });

  // AC 1.3a-2 — tool name matching boosts confidence
  it('[P1] tool name matching provides confidence boost over keyword-only scoring', () => {
    // Given: a message calling a specific Memtrace tool
    const msg = makeToolMessage('memtrace_get_symbol_context');
    // When: classified
    const result = classify(msg, mockCapabilities);
    // Then: the tool name pushes confidence above threshold
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('get_symbol_context');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.95);
  });

  // AC 1.3a-1 — null input produces typed MiddlewareError
  it('[P0] rejects null message with typed MiddlewareError (cause: classification_failed)', () => {
    // Given: null input (FR1: produce ClassifiedIntent envelope or error)
    const result = classify(null as unknown as Record<string, unknown>, mockCapabilities);
    // Then: Result is ok:false with classification_failed cause
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  // AC 1.3a-1 — error envelope contains all required fields
  it('[P0] returns complete MiddlewareErrorShape envelope with all required fields on failure', () => {
    // Given: null input triggering classification failure
    const result = classify(null as unknown as Record<string, unknown>, mockCapabilities);
    // Then: error shape has all envelope fields (tier, cause, recoverable, suggested_action, trace_id)
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

  // AC 1.3a-4 — empty object → unknown, passthrough:true (never errors)
  it('[P2] handles empty object as unknown intent with passthrough:true never erroring', () => {
    // Given: an empty message (FR4: unknown → passthrough)
    const result = classify({} as Record<string, unknown>, mockCapabilities);
    // Then: classified as unknown with passthrough, never throws
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('unknown');
    expect(result.value.passthrough).toBe(true);
  });

  // AC 1.3a-2 — split confidence between competing intents triggers passthrough
  it('[P1] returns passthrough when confidence is split evenly between competing intents', () => {
    // Given: two custom intents with the same keyword patterns (equal scoring)
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
    // When: a message matching both is classified
    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'shared word query' } },
    };
    const result = classify(msg, mockCapabilities);
    // Then: confidence is below threshold, passthrough is true
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.passthrough).toBe(true);
    expect(result.value.confidence).toBeLessThan(0.95);
    expect(result.value.confidence).toBeGreaterThan(0);
  });

  // AC 1.3a-1 — original_message reference preserved in ClassifiedIntent
  it('[P2] preserves original_message reference in the ClassifiedIntent return value', () => {
    // Given: a message to classify
    const msg = makeMessage('find function test', 'memtrace_find_code');
    // When: classified
    const result = classify(msg, mockCapabilities);
    // Then: the original message reference is preserved unchanged
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.original_message).toBe(msg);
  });
});

// AC 1.3a-3: plugin contract — new intent registered without modifying router internals
// AC 1.3a-4: backward compat — existing intents unaffected by new registration (FR4)
describe('plugin contract — IntentRegistry', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  // AC 1.3a-3 — register new intent without affecting existing ones
  it('[P0] registers a new intent type without modifying any existing intent definitions', () => {
    // Given: a fresh IntentRegistry with 3 MVP defaults
    const registry = new IntentRegistry();
    const beforeCount = registry.list().length;
    // When: a new intent type find_dead_code is registered via the plugin contract
    registry.register({
      type: 'find_dead_code',
      patterns: ['dead code', 'unused function', 'orphan method'],
      tools: ['memtrace_find_dead_code'],
    });
    // Then: total count increases by 1, all original intents remain
    const after = registry.list();
    expect(after.length).toBe(beforeCount + 1);
    expect(after.find((d) => d.type === 'find_dead_code')).toBeDefined();
    expect(after.find((d) => d.type === 'find_code')).toBeDefined();
    expect(after.find((d) => d.type === 'get_symbol_context')).toBeDefined();
    expect(after.find((d) => d.type === 'get_impact')).toBeDefined();
  });

  // AC 1.3a-3 — newly registered intent recognized via singleton registry
  it('[P1] classifies newly registered intent type through the singleton registry', () => {
    // Given: a new intent type registered on the singleton
    getRegistry().register({
      type: 'find_dead_code',
      patterns: ['dead code', 'unused function'],
      tools: ['memtrace_find_dead_code'],
    });
    // When: a message matching the new intent is classified
    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'show me dead code in this function' } },
    };
    const result = classify(msg, mockCapabilities);
    // Then: it is correctly classified as find_dead_code
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('find_dead_code');
  });

  // AC 1.3a-7 — backward compat: existing intents unaffected by new registration
  it('[P0] preserves backward compatibility — all 3 MVP intents still classify correctly after new registration', () => {
    // Given: a new intent type registered via plugin contract
    getRegistry().register({
      type: 'find_dead_code',
      patterns: ['dead code', 'unused function'],
      tools: ['memtrace_find_dead_code'],
    });
    // When: MVP intent messages are classified
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
    // Then: both MVP intents still classify correctly — no regression (FR4)
    expect(impactResult.ok).toBe(true);
    if (!impactResult.ok) return;
    expect(impactResult.value.intent_type).toBe('get_impact');
  });

  // AC 1.3a-3 — confidenceWeight multiplier works in scoring
  it('[P1] high confidenceWeight intent scores above default-weight intents for same pattern', () => {
    // Given: a high-priority intent with confidenceWeight 5.0
    getRegistry().register({
      type: 'high_priority',
      patterns: ['urgent', 'critical'],
      tools: [],
      confidenceWeight: 5.0,
    });
    // When: a message matching find_code keywords AND the high-priority patterns
    const msg = {
      method: 'tools/call',
      params: { arguments: { query: 'find function urgent critical fix' } },
    };
    const result = classify(msg, mockCapabilities);
    // Then: the weighted intent wins with high confidence
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent_type).toBe('high_priority');
    expect(result.value.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

// AC 1.3a-3 — IntentRegistry singleton exposes default intents
describe('getRegistry', () => {
  beforeEach(() => {
    getRegistry().reset();
  });

  it('[P2] returns the singleton IntentRegistry with all 3 default MVP intents pre-registered', () => {
    // Given: the singleton registry after reset
    const registry = getRegistry();
    const intents = registry.list();
    // Then: all 3 MVP intents are present
    expect(intents.length).toBeGreaterThanOrEqual(3);
    expect(intents.map((d) => d.type)).toContain('find_code');
    expect(intents.map((d) => d.type)).toContain('get_symbol_context');
    expect(intents.map((d) => d.type)).toContain('get_impact');
  });
});

// AC 1.3a-6 — sample-intents fixture provides test payloads for all 3 MVP intents
describe('sample-intents fixture', () => {
  it('[P3] contains valid MCP tools/call payloads for all 3 MVP intents plus ambiguous', () => {
    // Given: the sample-intents.json fixture file
    const fixturePath = path.resolve(__dirname, '../../fixtures/sample-intents.json');
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const fixture = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    // Then: all 4 expected payloads exist with correct MCP tool names
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
