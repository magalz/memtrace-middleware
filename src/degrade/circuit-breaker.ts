import type { MiddlewareConfig } from '../config/types.js';
import { createLogger } from '../logger.js';
import type { CircuitSnapshot } from '../types.js';

const log = createLogger('circuit-breaker');

type CircuitState = 'closed' | 'open' | 'half_open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureAt: number | null = null;
  private lastStateChangeAt: number;
  private openUntil: number | null = null;
  private halfOpenProbeCount = 0;

  private enabled: boolean;
  private failureThreshold: number;
  private successThreshold: number;
  private halfOpenMaxCalls: number;
  private openStateMs: number;

  constructor(config: MiddlewareConfig['circuit_breaker']) {
    this.enabled = config.enabled;
    this.failureThreshold = config.failure_threshold;
    this.successThreshold = config.success_threshold;
    this.halfOpenMaxCalls = config.half_open_max_calls;
    this.openStateMs = config.open_state_ms;
    this.lastStateChangeAt = Date.now();
  }

  onConfigChanged(config: MiddlewareConfig['circuit_breaker']): void {
    if (typeof config.enabled === 'boolean') {
      if (!config.enabled && this.enabled) this.reset();
      this.enabled = config.enabled;
    }
    if (config.failure_threshold !== undefined)
      this.failureThreshold = Math.max(1, config.failure_threshold);
    if (config.success_threshold !== undefined)
      this.successThreshold = Math.max(1, config.success_threshold);
    if (config.half_open_max_calls !== undefined)
      this.halfOpenMaxCalls = Math.max(1, config.half_open_max_calls);
    if (config.open_state_ms !== undefined) this.openStateMs = Math.max(1, config.open_state_ms);
  }

  recordSuccess(): void {
    if (!this.enabled) return;
    this.failureCount = 0;

    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.transitionTo('closed');
      }
    }
  }

  recordFailure(): void {
    if (!this.enabled) return;
    this.lastFailureAt = Date.now();

    if (this.state === 'half_open') {
      this.transitionTo('open');
      return;
    }

    if (this.state === 'closed') {
      this.failureCount++;
      this.successCount = 0;
      if (this.failureCount >= this.failureThreshold) {
        this.transitionTo('open');
      }
    }
  }

  allowRequest(): boolean {
    if (!this.enabled) return true;

    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      if (this.openUntil !== null && Date.now() >= this.openUntil) {
        this.transitionTo('half_open');
        this.halfOpenProbeCount = 1;
        return true;
      }
      return false;
    }

    if (this.state === 'half_open') {
      if (this.halfOpenProbeCount < this.halfOpenMaxCalls) {
        this.halfOpenProbeCount++;
        return true;
      }
      return false;
    }

    return true;
  }

  getCircuitSnapshot(): CircuitSnapshot {
    return {
      state: this.state,
      failure_count: this.failureCount,
      success_count: this.successCount,
      last_failure_at: this.lastFailureAt,
      last_state_change_at: this.lastStateChangeAt,
      open_until: this.openUntil,
    };
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = null;
    this.lastStateChangeAt = Date.now();
    this.openUntil = null;
    this.halfOpenProbeCount = 0;
  }

  private transitionTo(newState: CircuitState): void {
    const prev = this.state;
    this.state = newState;
    this.lastStateChangeAt = Date.now();

    if (newState === 'open') {
      this.openUntil = Date.now() + this.openStateMs;
      this.failureCount = this.failureThreshold;
      this.successCount = 0;
      this.halfOpenProbeCount = 0;
    } else if (newState === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
      this.openUntil = null;
      this.halfOpenProbeCount = 0;
    } else if (newState === 'half_open') {
      this.failureCount = 0;
      this.successCount = 0;
      this.openUntil = null;
    }

    log.info('circuit_state_change', {
      from: prev,
      to: newState,
    });
  }
}
