import { MiddlewareError } from '../errors.js';
import { createLogger } from '../logger.js';
import type { FusedContext, Result } from '../types.js';

const log = createLogger('fusion');

export function validateContext(context: FusedContext): Result<FusedContext> {
  const errors: { path: string; message: string }[] = [];

  for (const block of context.blocks) {
    const prefix = `${block.symbol}:`;

    if (!block.symbol || typeof block.symbol !== 'string' || block.symbol.trim() === '') {
      errors.push({ path: `${prefix}symbol`, message: 'symbol must be a non-empty string' });
    }

    if (!block.file_path || typeof block.file_path !== 'string' || block.file_path.trim() === '') {
      errors.push({
        path: `${prefix}file_path`,
        message: 'file_path must be a non-empty string',
      });
    }

    if (
      typeof block.start_line !== 'number' ||
      !Number.isFinite(block.start_line) ||
      block.start_line < 0
    ) {
      errors.push({
        path: `${prefix}start_line`,
        message: `start_line must be >= 0, got ${block.start_line}`,
      });
    }

    if (
      typeof block.end_line !== 'number' ||
      !Number.isFinite(block.end_line) ||
      block.end_line < 0
    ) {
      errors.push({
        path: `${prefix}end_line`,
        message: `end_line must be >= 0, got ${block.end_line}`,
      });
    }

    if (block.end_line < block.start_line) {
      errors.push({
        path: `${prefix}line_range`,
        message: `end_line (${block.end_line}) must be >= start_line (${block.start_line})`,
      });
    }
  }

  if (errors.length > 0) {
    const detail = errors
      .slice(0, 5)
      .map((e) => `${e.path} ${e.message}`)
      .join('; ');
    log.warn('fusion_validation_failed', { validation_errors: detail, count: errors.length });

    return {
      ok: false,
      error: new MiddlewareError({
        cause: 'fusion_validation_failed',
        recoverable: false,
        suggested_action: `fix_invalid_blocks: ${detail}`,
      }).toShape(),
    };
  }

  return { ok: true, value: context };
}
