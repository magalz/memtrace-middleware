import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { CircuitBreaker } from '../../../src/degrade/circuit-breaker.js';
import type { MiddlewareConfig } from '../../../src/config/types.js';
import { DEFAULT_CONFIG } from '../../../src/config/types.js';

function makeConfig(
  overrides?: Partial<MiddlewareConfig['circuit_breaker']>
): MiddlewareConfig['circuit_breaker'] {
  return { ...DEFAULT_CONFIG.circuit_breaker, ...overrides };
}

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    cb = new CircuitBreaker(makeConfig());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[P0] initial state is CLOSED — allowRequest returns true', () => {
    expect(cb.allowRequest()).toBe(true);
  });

  it('[P0] CLOSED→OPEN after N failures', () => {
    const config = makeConfig({ failure_threshold: 5 });
    cb = new CircuitBreaker(config);

    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.allowRequest()).toBe(false);
    const snap = cb.getCircuitSnapshot();
    expect(snap.state).toBe('open');
  });

  it('[P0] OPEN→HALF_OPEN after cooldown', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.allowRequest()).toBe(false);

    vi.advanceTimersByTime(30000);
    expect(cb.allowRequest()).toBe(true);
    const snap = cb.getCircuitSnapshot();
    expect(snap.state).toBe('half_open');
  });

  it('[P0] HALF_OPEN→CLOSED after M successes', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    vi.advanceTimersByTime(30000);
    cb.allowRequest();

    for (let i = 0; i < 3; i++) {
      cb.recordSuccess();
    }
    expect(cb.allowRequest()).toBe(true);
    const snap = cb.getCircuitSnapshot();
    expect(snap.state).toBe('closed');
  });

  it('[P0] HALF_OPEN→OPEN on single failure', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    vi.advanceTimersByTime(30000);
    cb.allowRequest();

    cb.recordFailure();
    expect(cb.allowRequest()).toBe(false);
    const snap = cb.getCircuitSnapshot();
    expect(snap.state).toBe('open');
  });

  it('[P0] reject during OPEN — all allowRequest return false', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    for (let i = 0; i < 10; i++) {
      expect(cb.allowRequest()).toBe(false);
    }
  });

  it('[P1] probe limit in HALF_OPEN — only half_open_max_calls allowed', () => {
    const config = makeConfig({ half_open_max_calls: 2 });
    cb = new CircuitBreaker(config);

    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    vi.advanceTimersByTime(30000);

    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(true);
    expect(cb.allowRequest()).toBe(false);
  });

  it('[P1] getCircuitSnapshot returns correct shape', () => {
    const snap = cb.getCircuitSnapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failure_count).toBe(0);
    expect(snap.success_count).toBe(0);
    expect(snap.last_failure_at).toBeNull();
    expect(snap.last_state_change_at).toBeTypeOf('number');
    expect(snap.open_until).toBeNull();
  });

  it('[P1] state change timestamps update on transition', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    const openSnap = cb.getCircuitSnapshot();
    expect(openSnap.state).toBe('open');
    expect(openSnap.last_state_change_at).toBeTypeOf('number');

    vi.advanceTimersByTime(30000);
    cb.allowRequest();
    const halfOpenSnap = cb.getCircuitSnapshot();
    expect(halfOpenSnap.state).toBe('half_open');
  });

  it('[P2] disabled circuit breaker allows all requests', () => {
    cb = new CircuitBreaker(makeConfig({ enabled: false }));
    for (let i = 0; i < 20; i++) {
      cb.recordFailure();
    }
    expect(cb.allowRequest()).toBe(true);
  });

  it('[P2] onConfigChanged toggles enabled state', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.allowRequest()).toBe(false);

    cb.onConfigChanged(makeConfig({ enabled: false }));
    expect(cb.allowRequest()).toBe(true);
  });

  it('[P2] reset returns to CLOSED with zero counts', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.getCircuitSnapshot().state).toBe('open');
    cb.reset();
    const snap = cb.getCircuitSnapshot();
    expect(snap.state).toBe('closed');
    expect(snap.failure_count).toBe(0);
    expect(snap.success_count).toBe(0);
    expect(cb.allowRequest()).toBe(true);
  });
});
