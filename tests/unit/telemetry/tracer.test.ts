import { describe, it, expect } from 'vitest';
import { generateTraceId, createTraceContext } from '../../../src/telemetry/tracer.js';

describe('tracer', () => {
  it('[P0] generates trace id in format {short}-{uuid8} for known intent types', () => {
    const id = generateTraceId('find_code');
    expect(id).toMatch(/^fc-[0-9a-f]{8}$/);
  });

  it('[P0] uses gsc for get_symbol_context', () => {
    const id = generateTraceId('get_symbol_context');
    expect(id).toMatch(/^gsc-[0-9a-f]{8}$/);
  });

  it('[P0] uses gi for get_impact', () => {
    const id = generateTraceId('get_impact');
    expect(id).toMatch(/^gi-[0-9a-f]{8}$/);
  });

  it('[P0] falls back to first 4 chars for unknown intent type', () => {
    const id = generateTraceId('custom_tool');
    expect(id).toMatch(/^cust-[0-9a-f]{8}$/);
  });

  it('[P1] generates unique trace ids on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateTraceId('find_code')));
    expect(ids.size).toBe(100);
  });

  it('[P1] createTraceContext returns correct shape', () => {
    const ctx = createTraceContext('find_code');
    expect(ctx).toHaveProperty('trace_id');
    expect(ctx).toHaveProperty('intent_type', 'find_code');
    expect(ctx).toHaveProperty('started_at');
    expect(() => new Date(ctx.started_at)).not.toThrow();
  });

  it('[P2] createTraceContext trace_id matches expected format', () => {
    const ctx = createTraceContext('get_impact');
    expect(ctx.trace_id).toMatch(/^gi-[0-9a-f]{8}$/);
  });

  it('[P2] generateTraceId does not throw for any string input', () => {
    expect(() => generateTraceId('')).not.toThrow();
    expect(() => generateTraceId('a')).not.toThrow();
    expect(() => generateTraceId('ab')).not.toThrow();
    expect(() => generateTraceId('abc')).not.toThrow();
    expect(() => generateTraceId('a_b_c')).not.toThrow();
    expect(() => generateTraceId('x'.repeat(100))).not.toThrow();
    expect(() => generateTraceId('find_code')).not.toThrow();
  });

  it('[P2] empty string input falls back to unk prefix', () => {
    const id = generateTraceId('');
    expect(id).toMatch(/^unk-[0-9a-f]{8}$/);
  });

  it('[P2] generates unique ids across 1000 calls with no collisions', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateTraceId('find_code')));
    expect(ids.size).toBe(1000);
  });

  it('[P1] generates rc-{uuid8} format for review_code intent', () => {
    const id = generateTraceId('review_code');
    expect(id).toMatch(/^rc-[0-9a-f]{8}$/);
  });

  it('[P1] generates gsf-{uuid8} format for get_style_fingerprint intent', () => {
    const id = generateTraceId('get_style_fingerprint');
    expect(id).toMatch(/^gsf-[0-9a-f]{8}$/);
  });
});
