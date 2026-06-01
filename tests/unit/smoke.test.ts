// AC 1.1-3: placeholder test in tests/unit/smoke.test.ts — Vitest discovers and runs tests
// AC 1.1-6: MiddlewareError envelope fields (tier, cause, recoverable, suggested_action, trace_id)
// AC 1.1-7: MCP method names, timeout defaults exported as UPPER_SNAKE_CASE constants
// AC 1.1-8: createLogger wraps structured JSON to stderr (never console.log)
import { describe, it, expect } from 'vitest';

import { createLogger } from '../../src/logger.js';
import { MiddlewareError } from '../../src/errors.js';
import { DegradationTier } from '../../src/types.js';
import {
  MAX_SUB_QUERY_TIMEOUT_MS,
  MAX_DISPATCH_TIMEOUT_MS,
  PROBE_INTERVAL_MS,
  HYSTERESIS_PROBE_COUNT,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  MCP_TOOL_FIND_CODE,
  MCP_TOOL_GET_SYMBOL_CONTEXT,
  MCP_TOOL_GET_IMPACT,
} from '../../src/constants.js';

describe('scaffold smoke', () => {
  // AC 1.1-8 — Logger wired, structured JSON to stderr
  it('[P1] creates a logger with all log levels and emits NDJSON to stderr without throw', () => {
    // Given: the logger factory from src/logger.ts
    const log = createLogger('test');
    // Then: all log level methods exist
    expect(log.debug).toBeTypeOf('function');
    expect(log.info).toBeTypeOf('function');
    expect(log.warn).toBeTypeOf('function');
    expect(log.error).toBeTypeOf('function');
    // And: calling info does not throw (structured JSON emitted to stderr)
    expect(() => {
      log.info('smoke test', { trace_id: 'abc' });
    }).not.toThrow();
  });

  // AC 1.1-6 — MiddlewareError with standard envelope: tier, cause, recoverable, suggested_action, trace_id
  it('[P0] instantiates MiddlewareError with default tier and auto-generated trace_id', () => {
    // Given: a validation error scenario
    const err = new MiddlewareError({
      cause: 'config_invalid',
      recoverable: false,
      suggested_action: 'Check config file',
    });
    // Then: it extends Error and carries all envelope fields
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MiddlewareError');
    expect(err.tier).toBe(DegradationTier.Full);
    expect(err.cause).toBe('config_invalid');
    expect(err.recoverable).toBe(false);
    expect(err.trace_id).toBeTypeOf('string');
    expect(err.trace_id.length).toBe(8);
  });

  // AC 1.1-6 — explicit tier override
  it('[P0] instantiates MiddlewareError with explicit degradation tier', () => {
    // Given: a connection error scenario at Passthrough tier
    const err = new MiddlewareError({
      cause: 'memtrace_unavailable',
      recoverable: true,
      suggested_action: 'Retry connection',
      tier: DegradationTier.Passthrough,
    });
    // Then: tier and recoverable flag are set as specified
    expect(err.tier).toBe(DegradationTier.Passthrough);
    expect(err.recoverable).toBe(true);
  });

  // AC 1.1-6 — MiddlewareErrorShape serialization via toShape()
  it('[P0] serializes MiddlewareError to MiddlewareErrorShape preserving all fields', () => {
    // Given: an error at IntentReduced tier
    const err = new MiddlewareError({
      cause: 'classification_failed',
      recoverable: true,
      suggested_action: 'Fallback to keyword match',
      tier: DegradationTier.IntentReduced,
    });
    // When: serialized via toShape()
    const shape = err.toShape();
    // Then: all envelope fields are preserved in the shape
    expect(shape.tier).toBe(DegradationTier.IntentReduced);
    expect(shape.cause).toBe('classification_failed');
    expect(shape.recoverable).toBe(true);
    expect(shape.suggested_action).toBe('Fallback to keyword match');
    expect(shape.trace_id).toBe(err.trace_id);
  });

  // AC 1.1-7 — constants defined as UPPER_SNAKE_CASE
  it('[P0] exports expected timeout, threshold, and MCP method name constants', () => {
    // Given: src/constants.ts exports foundational constants
    // Then: all values match the architecture specification
    expect(MAX_SUB_QUERY_TIMEOUT_MS).toBe(200);
    expect(MAX_DISPATCH_TIMEOUT_MS).toBe(3000);
    expect(PROBE_INTERVAL_MS).toBe(15000);
    expect(HYSTERESIS_PROBE_COUNT).toBe(3);
    expect(CLASSIFICATION_CONFIDENCE_THRESHOLD).toBe(0.95);
    expect(MCP_TOOL_FIND_CODE).toBe('memtrace_find_code');
    expect(MCP_TOOL_GET_SYMBOL_CONTEXT).toBe('memtrace_get_symbol_context');
    expect(MCP_TOOL_GET_IMPACT).toBe('memtrace_get_impact');
  });
});
