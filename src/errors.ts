import crypto from 'node:crypto';

import { DegradationTier, type ErrorCause, type MiddlewareErrorShape } from './types.js';

export class MiddlewareError extends Error {
  public readonly tier: DegradationTier;
  public readonly cause: ErrorCause;
  public readonly recoverable: boolean;
  public readonly suggested_action: string;
  public readonly trace_id: string;

  constructor(params: {
    cause: ErrorCause;
    recoverable: boolean;
    suggested_action: string;
    tier?: DegradationTier;
  }) {
    const traceId = crypto.randomUUID().slice(0, 8);
    super(`[${params.cause}] ${params.suggested_action} (trace: ${traceId})`);

    this.name = 'MiddlewareError';
    this.tier = params.tier ?? DegradationTier.Full;
    this.cause = params.cause;
    this.recoverable = params.recoverable;
    this.suggested_action = params.suggested_action;
    this.trace_id = traceId;
  }

  toShape(): MiddlewareErrorShape {
    return {
      tier: this.tier,
      cause: this.cause,
      recoverable: this.recoverable,
      suggested_action: this.suggested_action,
      trace_id: this.trace_id,
    };
  }
}
