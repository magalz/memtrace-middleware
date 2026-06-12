import { MiddlewareError } from '../errors.js';
import type { RateLimitSnapshot, Result } from '../types.js';
import type { MiddlewareConfig } from '../config/types.js';
import { createLogger } from '../logger.js';

const log = createLogger('rate-limiter');

export class RateLimiter {
  private maxRequests: number;
  private windowMs: number;
  private maxConcurrent: number;
  private timestamps: number[] = [];
  private concurrent = 0;
  private limitedCount = 0;
  private enabled: boolean;

  constructor(config: MiddlewareConfig['rate_limiting']) {
    this.enabled = config.enabled;
    this.maxRequests = config.max_requests_per_window;
    this.windowMs = config.window_ms;
    this.maxConcurrent = config.max_concurrent;
  }

  onConfigChanged(config: MiddlewareConfig['rate_limiting']): void {
    if (typeof config.enabled === 'boolean') {
      if (!config.enabled && this.enabled) this.reset();
      this.enabled = config.enabled;
    }
    if (config.max_requests_per_window !== undefined) this.maxRequests = Math.max(1, config.max_requests_per_window);
    if (config.window_ms !== undefined) this.windowMs = Math.max(1, config.window_ms);
    if (config.max_concurrent !== undefined) this.maxConcurrent = Math.max(1, config.max_concurrent);
  }

  checkRateLimit(_intentType?: string): Result<void, MiddlewareError> {
    if (!this.enabled) {
      return { ok: true, value: undefined };
    }

    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

    if (this.timestamps.length >= this.maxRequests) {
      this.limitedCount++;
      log.warn('rate_limit_exceeded', {
        current: this.timestamps.length,
        max: this.maxRequests,
      });
      return {
        ok: false,
        error: new MiddlewareError({
          cause: 'rate_limited',
          recoverable: true,
          suggested_action: 'retry_with_backoff',
        }),
      };
    }

    this.timestamps.push(now);
    return { ok: true, value: undefined };
  }

  acquireSlot(): boolean {
    if (!this.enabled) {
      return true;
    }
    if (this.concurrent >= this.maxConcurrent) {
      this.limitedCount++;
      return false;
    }
    this.concurrent++;
    return true;
  }

  releaseSlot(): void {
    if (this.concurrent > 0) {
      this.concurrent--;
    }
  }

  getRateLimitSnapshot(): RateLimitSnapshot {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    return {
      window_ms: this.windowMs,
      max_requests: this.maxRequests,
      current_count: this.timestamps.length,
      current_concurrent: this.concurrent,
      max_concurrent: this.maxConcurrent,
      reset_at: this.timestamps.length > 0 ? this.timestamps[0]! + this.windowMs : now + this.windowMs,
      limited_count: this.limitedCount,
    };
  }

  reset(): void {
    this.timestamps = [];
    this.concurrent = 0;
    this.limitedCount = 0;
  }
}
