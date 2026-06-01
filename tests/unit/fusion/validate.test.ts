// AC 8: Negative fusion validation — fabricated code references rejected
import { describe, it, expect } from 'vitest';

import { validateContext } from '../../../src/fusion/validate.js';
import type { FusedContext, ContextBlock } from '../../../src/types.js';

function makeBlock(overrides: Partial<ContextBlock> = {}): ContextBlock {
  return {
    symbol: 'myFunc',
    file_path: 'src/file.ts',
    start_line: 10,
    end_line: 20,
    centrality: 0,
    query_type: 'memtrace_find_code',
    ...overrides,
  };
}

function makeContext(blocks: ContextBlock[], overrides: Partial<FusedContext> = {}): FusedContext {
  return {
    blocks,
    partial: false,
    trace_id: 'test-001',
    provenance: [],
    ...overrides,
  };
}

describe('validateContext() — fusion validation', () => {
  // AC 8 — valid passes
  it('[P0] accepts valid context with all fields correct', () => {
    const ctx = makeContext([makeBlock()]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.blocks).toHaveLength(1);
    }
  });

  // AC 8 — empty file_path rejected
  it('[P0] rejects block with empty file_path', () => {
    const ctx = makeContext([makeBlock({ file_path: '' })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });

  // AC 8 — end_line < start_line rejected
  it('[P0] rejects block with end_line less than start_line', () => {
    const ctx = makeContext([makeBlock({ start_line: 20, end_line: 10 })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });

  // AC 8 — negative start_line rejected
  it('[P0] rejects block with negative start_line', () => {
    const ctx = makeContext([makeBlock({ start_line: -1 })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });

  // AC 8 — negative end_line rejected
  it('[P0] rejects block with negative end_line', () => {
    const ctx = makeContext([makeBlock({ end_line: -5 })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });

  // AC 8 — blank symbol rejected
  it('[P0] rejects block with blank symbol', () => {
    const ctx = makeContext([makeBlock({ symbol: '' })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });

  // AC 8 — multiple blocks, first invalid triggers rejection
  it('[P0] rejects when first of multiple blocks is invalid', () => {
    const ctx = makeContext([
      makeBlock({ file_path: '' }),
      makeBlock({ symbol: 'validFn', file_path: 'src/valid.ts', start_line: 1, end_line: 10 }),
    ]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
  });

  // Partial is acceptable
  it('[P1] accepts valid context with partial: true', () => {
    const ctx = makeContext([makeBlock()], { partial: true });
    const result = validateContext(ctx);
    expect(result.ok).toBe(true);
  });

  // Empty blocks array
  it('[P1] accepts context with empty blocks', () => {
    const ctx = makeContext([]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(true);
  });

  // Zero start_line and end_line
  it('[P1] accepts zero start_line and end_line (valid case)', () => {
    const ctx = makeContext([makeBlock({ start_line: 0, end_line: 0 })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(true);
  });

  // start_line == end_line, valid
  it('[P2] accepts start_line equal to end_line', () => {
    const ctx = makeContext([makeBlock({ start_line: 42, end_line: 42 })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(true);
  });

  // Non-finite numbers
  it('[P2] rejects block with Infinity start_line', () => {
    const ctx = makeContext([makeBlock({ start_line: Infinity })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });

  it('[P2] rejects block with NaN end_line', () => {
    const ctx = makeContext([makeBlock({ end_line: NaN })]);
    const result = validateContext(ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.cause).toBe('fusion_validation_failed');
    }
  });
});
