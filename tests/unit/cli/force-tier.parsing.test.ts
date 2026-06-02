import { describe, it, expect } from 'vitest';

import { DegradationTier } from '../../../src/types.js';

// parseTierArg is exported from src/cli/index.ts
const parseTierArg: (raw: string) => DegradationTier | null = (
  await import('../../../src/cli/index.js')
).parseTierArg;

describe('parseTierArg', () => {
  it("parseTierArg('full') → DegradationTier.Full", () => {
    expect(parseTierArg('full')).toBe(DegradationTier.Full);
  });

  it("parseTierArg('FULL') → DegradationTier.Full (case-insensitive)", () => {
    expect(parseTierArg('FULL')).toBe(DegradationTier.Full);
  });

  it("parseTierArg('intent_reduced') → DegradationTier.IntentReduced", () => {
    expect(parseTierArg('intent_reduced')).toBe(DegradationTier.IntentReduced);
  });

  it("parseTierArg('banana') → null", () => {
    expect(parseTierArg('banana')).toBeNull();
  });

  it("parseTierArg('passthrough') → DegradationTier.Passthrough", () => {
    expect(parseTierArg('passthrough')).toBe(DegradationTier.Passthrough);
  });

  it("parseTierArg('FAIL_CLOSED') → DegradationTier.FailClosed", () => {
    expect(parseTierArg('FAIL_CLOSED')).toBe(DegradationTier.FailClosed);
  });

  it("parseTierArg('') → null", () => {
    expect(parseTierArg('')).toBeNull();
  });

  it('parseTierArg with invalid degradation-floor values returns null', () => {
    expect(parseTierArg('invalid_floor_value')).toBeNull();
    expect(parseTierArg('123')).toBeNull();
    expect(parseTierArg('full ')).toBeNull();
  });
});
