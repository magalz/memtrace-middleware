import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { RateLimiter } from '../../../src/degrade/rate-limiter.js';
import type { MiddlewareConfig } from '../../../src/config/types.js';
import { DEFAULT_CONFIG } from '../../../src/config/types.js';

function makeConfig(
  overrides?: Partial<MiddlewareConfig['rate_limiting']>
): MiddlewareConfig['rate_limiting'] {
  return { ...DEFAULT_CONFIG.rate_limiting, ...overrides };
}

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[P0] sliding window allows requests under limit', () => {
    for (let i = 0; i < 99; i++) {
      const result = limiter.checkRateLimit();
      expect(result.ok).toBe(true);
    }
  });

  it('[P0] sliding window rejects when limit exceeded', () => {
    for (let i = 0; i < 100; i++) {
      limiter.checkRateLimit();
    }
    const result = limiter.checkRateLimit();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('rate_limited');
      expect(result.error.recoverable).toBe(true);
      expect(result.error.suggested_action).toBe('retry_with_backoff');
    }
  });

  it('[P0] window resets after window_ms elapses', () => {
    for (let i = 0; i < 100; i++) {
      limiter.checkRateLimit();
    }
    expect(limiter.checkRateLimit().ok).toBe(false);
    vi.advanceTimersByTime(60000);
    expect(limiter.checkRateLimit().ok).toBe(true);
  });

  it('[P1] concurrent slot acquire/release cycles', () => {
    for (let i = 0; i < 10; i++) {
      expect(limiter.acquireSlot()).toBe(true);
    }
    expect(limiter.acquireSlot()).toBe(false);
    limiter.releaseSlot();
    expect(limiter.acquireSlot()).toBe(true);
  });

  it('[P1] concurrent limiter rejects at max', () => {
    for (let i = 0; i < 10; i++) {
      limiter.acquireSlot();
    }
    expect(limiter.acquireSlot()).toBe(false);
  });

  it('[P2] double-release safety does not go below zero', () => {
    limiter.acquireSlot();
    limiter.releaseSlot();
    limiter.releaseSlot();
    const snap = limiter.getRateLimitSnapshot();
    expect(snap.current_concurrent).toBe(0);
  });

  it('[P1] getRateLimitSnapshot returns correct shape', () => {
    limiter.acquireSlot();
    limiter.checkRateLimit();
    const snap = limiter.getRateLimitSnapshot();
    expect(snap.window_ms).toBe(60000);
    expect(snap.max_requests).toBe(100);
    expect(snap.max_concurrent).toBe(10);
    expect(snap.current_count).toBe(1);
    expect(snap.current_concurrent).toBe(1);
    expect(snap.limited_count).toBe(0);
    expect(snap.reset_at).toBeTypeOf('number');
  });

  it('[P2] disabled rate limiter bypasses all checks', () => {
    limiter = new RateLimiter(makeConfig({ enabled: false }));
    for (let i = 0; i < 200; i++) {
      expect(limiter.checkRateLimit().ok).toBe(true);
    }
    for (let i = 0; i < 100; i++) {
      expect(limiter.acquireSlot()).toBe(true);
    }
  });

  it('[P2] onConfigChanged toggles enabled state', () => {
    limiter = new RateLimiter(makeConfig({ enabled: true }));
    for (let i = 0; i < 100; i++) {
      limiter.checkRateLimit();
    }
    expect(limiter.checkRateLimit().ok).toBe(false);

    limiter.onConfigChanged(makeConfig({ enabled: false }));
    expect(limiter.checkRateLimit().ok).toBe(true);
    expect(limiter.acquireSlot()).toBe(true);
  });

  it('[P2] reset clears all state', () => {
    for (let i = 0; i < 100; i++) {
      limiter.checkRateLimit();
    }
    for (let i = 0; i < 10; i++) {
      limiter.acquireSlot();
    }
    limiter.reset();
    const snap = limiter.getRateLimitSnapshot();
    expect(snap.current_count).toBe(0);
    expect(snap.current_concurrent).toBe(0);
    expect(snap.limited_count).toBe(0);
    expect(limiter.acquireSlot()).toBe(true);
    expect(limiter.checkRateLimit().ok).toBe(true);
  });
});
