// AC 1.4-5: Zod validation at adapter boundary rejects malformed payloads with MiddlewareError (FR23)
// AC 1.4-9: 12 validation tests covering all malformed message edge cases
import { describe, it, expect } from 'vitest';

import { validateToolCall } from '../../../src/interface/validate.js';

describe('validateToolCall', () => {
  it('[P0] should accept a valid tools/call message', () => {
    const msg = {
      method: 'tools/call',
      params: {
        name: 'memtrace_find_code',
        arguments: { query: 'authenticateUser' },
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.method).toBe('tools/call');
    expect(result.value.params.name).toBe('memtrace_find_code');
    expect(result.value.params.arguments).toEqual({ query: 'authenticateUser' });
  });

  it('[P0] should default params.arguments to empty object when absent', () => {
    const msg = {
      method: 'tools/call',
      params: {
        name: 'memtrace_get_symbol_context',
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.params.arguments).toEqual({});
  });

  it('[P0] should reject message missing method field', () => {
    const msg = {
      params: {
        name: 'memtrace_find_code',
        arguments: { query: 'test' },
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
    expect(result.error.recoverable).toBe(true);
  });

  it('[P0] should reject message with wrong method value', () => {
    const msg = {
      method: 'initialize',
      params: { name: 'memtrace_find_code' },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  it('[P0] should reject message missing params field', () => {
    const msg = {
      method: 'tools/call',
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  it('[P1] should reject message with missing params.name', () => {
    const msg = {
      method: 'tools/call',
      params: {
        arguments: { query: 'test' },
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  it('[P1] should reject message with non-string params.name', () => {
    const msg = {
      method: 'tools/call',
      params: {
        name: 42,
        arguments: { query: 'test' },
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('[P1] should reject message with params.arguments as a string instead of object', () => {
    const msg = {
      method: 'tools/call',
      params: {
        name: 'memtrace_find_code',
        arguments: 'not an object',
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('[P2] should reject null input', () => {
    const result = validateToolCall(null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  it('[P2] should reject undefined input', () => {
    const result = validateToolCall(undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.cause).toBe('classification_failed');
  });

  it('[P2] should reject primitive string input', () => {
    const result = validateToolCall('not an object');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeTruthy();
  });

  it('[P2] should accept params.arguments with nested objects', () => {
    const msg = {
      method: 'tools/call',
      params: {
        name: 'memtrace_get_impact',
        arguments: {
          target: 'calculateTotal',
          options: { depth: 3, direction: 'upstream' },
        },
      },
    };

    const result = validateToolCall(msg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.params.arguments).toEqual({
      target: 'calculateTotal',
      options: { depth: 3, direction: 'upstream' },
    });
  });
});
