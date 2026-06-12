import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MemtraceBackend } from '../../src/backend/trait.js';

import { CircuitBreaker } from '../../src/degrade/circuit-breaker.js';
import { RateLimiter } from '../../src/degrade/rate-limiter.js';
import { DEFAULT_CONFIG, type MiddlewareConfig } from '../../src/config/types.js';
import { degradationMachine } from '../../src/degrade/machine.js';
import { BaseAdapter } from '../../src/interface/base-adapter.js';
import { initializeDegradation, shutdownDegradation } from '../../src/degrade/index.js';
import { MiddlewareError } from '../../src/errors.js';
import { mockCapabilities } from '../helpers/test-utils.js';

describe('Circuit Breaker Integration', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    degradationMachine.reset();
    cb = new CircuitBreaker(DEFAULT_CONFIG.circuit_breaker);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[P0] backend cascade failure → circuit opens → queries rejected → recovery → circuit closes', () => {
    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
    }
    expect(cb.allowRequest()).toBe(false);
    const openSnap = cb.getCircuitSnapshot();
    expect(openSnap.state).toBe('open');

    vi.advanceTimersByTime(30000);
    expect(cb.allowRequest()).toBe(true);

    for (let i = 0; i < 3; i++) {
      cb.recordSuccess();
    }
    expect(cb.allowRequest()).toBe(true);
    const closedSnap = cb.getCircuitSnapshot();
    expect(closedSnap.state).toBe('closed');
  });

  it('[P1] rate limiter + circuit breaker independent operation', () => {
    const rl = new RateLimiter(DEFAULT_CONFIG.rate_limiting);

    for (let i = 0; i < 5; i++) {
      cb.recordFailure();
      rl.checkRateLimit();
    }
    expect(cb.allowRequest()).toBe(false);
    expect(rl.checkRateLimit().ok).toBe(true);

    vi.advanceTimersByTime(30000);
    expect(cb.allowRequest()).toBe(true);
  });
});

describe('Dispatch E2E — rate limit + circuit breaker (Story 7.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    degradationMachine.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    shutdownDegradation();
  });

  function createExecBackend(
    failUntilCount: number = Infinity
  ): { backend: MemtraceBackend; callCount: () => number } {
    let count = 0;
    return {
      backend: {
        execute: async () => {
          count++;
          if (count <= failUntilCount) {
            throw new MiddlewareError({
              cause: 'memtrace_unavailable',
              recoverable: true,
              suggested_action: 'retry_connection',
            });
          }
          return {
            tool: 'memtrace_find_code' as const,
            data: [{ name: 'foo', file_path: 'bar.ts', start_line: 1, end_line: 10, kind: 'Function' as const }],
            trace_id: 't1',
            elapsed_ms: 5,
            degraded: false,
          };
        },
        probe: async () => true,
        listTools: async () => mockCapabilities.tools,
      },
      callCount: () => count,
    };
  }

  function makeMsg(tool = 'memtrace_find_code'): Record<string, unknown> {
    return {
      method: 'tools/call',
      params: { name: tool, arguments: { name: 'someFunction', scope: 'callers' } },
    };
  }

  it('[P0] rate limiter blocks excess concurrent dispatches at dispatch entry', async () => {
    const config: MiddlewareConfig = {
      ...DEFAULT_CONFIG,
      rate_limiting: { enabled: true, max_requests_per_window: 100, window_ms: 60000, max_concurrent: 2 },
    };
    const { backend } = createExecBackend(0);
    initializeDegradation(backend, config);
    const adapter = new BaseAdapter(backend, config);

    const results = await Promise.all([
      adapter.dispatch(makeMsg()),
      adapter.dispatch(makeMsg()),
      adapter.dispatch(makeMsg()),
    ]);

    const rateLimited = results.find((r) => {
      try {
        const parsed = JSON.parse(r.content[0].text as string);
        return parsed.cause === 'rate_limited';
      } catch {
        return false;
      }
    });
    expect(rateLimited).toBeDefined();
    if (rateLimited) {
      const parsed = JSON.parse(rateLimited.content[0].text as string);
      expect(parsed.recoverable).toBe(true);
      expect(parsed.suggested_action).toBe('retry_with_backoff');
    }
  });

  it('[P0] circuit breaker opens after consecutive backend failures via dispatch pipeline', async () => {
    const config: MiddlewareConfig = {
      ...DEFAULT_CONFIG,
      circuit_breaker: { enabled: true, failure_threshold: 3, success_threshold: 2, half_open_max_calls: 2, open_state_ms: 30000 },
    };
    const { backend } = createExecBackend(5);
    initializeDegradation(backend, config);
    const adapter = new BaseAdapter(backend, config);

    for (let i = 0; i < 3; i++) {
      await adapter.dispatch(makeMsg());
    }

    const blocked = await adapter.dispatch(makeMsg());
    const parsed = JSON.parse(blocked.content[0].text as string);
    expect(parsed.cause).toBe('circuit_open');
    expect(parsed.suggested_action).toBe('wait_and_retry');
    expect(parsed.recoverable).toBe(true);
  });

  it('[P0] circuit breaker recovers after cooldown and successful probes', async () => {
    const config: MiddlewareConfig = {
      ...DEFAULT_CONFIG,
      circuit_breaker: { enabled: true, failure_threshold: 3, success_threshold: 1, half_open_max_calls: 1, open_state_ms: 10000 },
    };
    const { backend } = createExecBackend(3);
    initializeDegradation(backend, config);
    const adapter = new BaseAdapter(backend, config);

    for (let i = 0; i < 3; i++) {
      await adapter.dispatch(makeMsg());
    }

    const blocked = await adapter.dispatch(makeMsg());
    expect(JSON.parse(blocked.content[0].text as string).cause).toBe('circuit_open');

    vi.advanceTimersByTime(10000);

    const recovered = await adapter.dispatch(makeMsg());
    expect(recovered.metadata?.tier).toBeDefined();
    expect(recovered.content[0].type).toBe('text');
  });
});
