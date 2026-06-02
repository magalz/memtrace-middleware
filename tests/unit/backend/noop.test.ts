// Task 2 — Extract noop backend to proper module (AC: 1, 4)
// AC 1: noop execute throws MiddlewareError (not raw Error)
// AC 4: noop backend has no token access — clean trait contract
import { describe, it, expect } from 'vitest';

import { createNoopBackend } from '../../../src/backend/noop.js';
import type { MemtraceBackend } from '../../../src/backend/trait.js';

describe('createNoopBackend (Task 2)', () => {
  it('[P0] returns MemtraceBackend-compliant object with all required methods', () => {
    const backend = createNoopBackend();
    expect(typeof backend.execute).toBe('function');
    expect(typeof backend.probe).toBe('function');
    expect(typeof backend.listTools).toBe('function');
    expect(typeof backend.disconnect).toBe('function');
  });

  it('[P0] probe() returns false', async () => {
    const backend = createNoopBackend();
    await expect(backend.probe()).resolves.toBe(false);
  });

  it('[P0] listTools() returns empty array', async () => {
    const backend = createNoopBackend();
    await expect(backend.listTools()).resolves.toEqual([]);
  });

  it('[P0] disconnect() is a no-op that does not throw', async () => {
    const backend = createNoopBackend();
    await expect(backend.disconnect!()).resolves.toBeUndefined();
  });

  it('[P0] execute() throws MiddlewareError with cause "memtrace_unavailable"', async () => {
    const backend = createNoopBackend();
    const controller = new AbortController();
    try {
      await backend.execute(
        { tool: 'memtrace_find_code', arguments: { query: 'test' } },
        controller.signal
      );
      expect.unreachable('should have thrown');
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      expect(e.cause).toBe('memtrace_unavailable');
      expect(e.recoverable).toBe(true);
      expect(typeof e.message).toBe('string');
      expect(e.message).toContain('memtrace_unavailable');
    }
  });

  it('[P0] satisfies MemtraceBackend trait at the type level', () => {
    const backend: MemtraceBackend = createNoopBackend();
    expect(backend).toBeDefined();
  });
});
