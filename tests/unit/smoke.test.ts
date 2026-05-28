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
  it('creates a logger with all log levels', () => {
    const log = createLogger('test');

    expect(log.debug).toBeTypeOf('function');
    expect(log.info).toBeTypeOf('function');
    expect(log.warn).toBeTypeOf('function');
    expect(log.error).toBeTypeOf('function');

    expect(() => {
      log.info('smoke test', { trace_id: 'abc' });
    }).not.toThrow();
  });

  it('instantiates MiddlewareError with default tier', () => {
    const err = new MiddlewareError({
      cause: 'config_invalid',
      recoverable: false,
      suggested_action: 'Check config file',
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('MiddlewareError');
    expect(err.tier).toBe(DegradationTier.Full);
    expect(err.cause).toBe('config_invalid');
    expect(err.recoverable).toBe(false);
    expect(err.trace_id).toBeTypeOf('string');
    expect(err.trace_id.length).toBe(8);
  });

  it('instantiates MiddlewareError with explicit tier', () => {
    const err = new MiddlewareError({
      cause: 'memtrace_unavailable',
      recoverable: true,
      suggested_action: 'Retry connection',
      tier: DegradationTier.Passthrough,
    });

    expect(err.tier).toBe(DegradationTier.Passthrough);
    expect(err.recoverable).toBe(true);
  });

  it('serializes MiddlewareError to shape', () => {
    const err = new MiddlewareError({
      cause: 'classification_failed',
      recoverable: true,
      suggested_action: 'Fallback to keyword match',
      tier: DegradationTier.IntentReduced,
    });

    const shape = err.toShape();

    expect(shape.tier).toBe(DegradationTier.IntentReduced);
    expect(shape.cause).toBe('classification_failed');
    expect(shape.recoverable).toBe(true);
    expect(shape.suggested_action).toBe('Fallback to keyword match');
    expect(shape.trace_id).toBe(err.trace_id);
  });

  it('exports expected constants', () => {
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
