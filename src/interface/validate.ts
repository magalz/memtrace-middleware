import { z } from 'zod';

import { MiddlewareError } from '../errors.js';
import { createLogger } from '../logger.js';

const log = createLogger('interface');

const toolCallMessageSchema = z.object({
  method: z.literal('tools/call'),
  params: z.object({
    name: z.string().min(1),
    arguments: z.record(z.unknown()).default({}),
  }),
});

export interface ToolCallMessage {
  method: 'tools/call';
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export function validateToolCall(
  message: unknown
): { ok: true; value: ToolCallMessage } | { ok: false; error: ReturnType<MiddlewareError['toShape']> } {
  if (message === null || message === undefined || typeof message !== 'object') {
    const err = new MiddlewareError({
      cause: 'classification_failed',
      recoverable: true,
      suggested_action: 'retry_with_valid_message',
    });
    log.warn('validation_rejected', { reason: 'not_an_object', trace_id: err.trace_id });
    return { ok: false, error: err.toShape() };
  }

  const parsed = toolCallMessageSchema.safeParse(message);

  if (!parsed.success) {
    const err = new MiddlewareError({
      cause: 'classification_failed',
      recoverable: true,
      suggested_action: 'retry_with_valid_message',
    });
    log.warn('validation_rejected', {
      reason: 'schema_mismatch',
      issues: parsed.error.issues.map((i) => i.path.join('.')),
      trace_id: err.trace_id,
    });
    return { ok: false, error: err.toShape() };
  }

  return { ok: true, value: parsed.data as ToolCallMessage };
}
