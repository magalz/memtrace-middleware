import { describe, it, expect, beforeEach } from 'vitest';

import { HYSTERESIS_PROBE_COUNT } from '../../../src/constants.js';
import { degradationMachine } from '../../../src/degrade/machine.js';
import { DegradationTier } from '../../../src/types.js';

describe('DegradationMachine', () => {
  beforeEach(() => {
    degradationMachine.reset();
  });

  it('[P0] initial state is Full tier', () => {
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] single probe failure does NOT trigger degradation', () => {
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] three consecutive probe failures triggers Full → IntentReduced', () => {
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P0] six consecutive probe failures triggers Full → IntentReduced → Passthrough', () => {
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  it('[P0] nine consecutive probe failures triggers Full → IntentReduced → Passthrough → FailClosed', () => {
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.FailClosed);
  });

  it('[P0] one success resets failure counter', () => {
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(true);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] three consecutive successes triggers recovery', () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] Passthrough recovery goes straight to Full', () => {
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] floor Passthrough prevents upgrade to IntentReduced', () => {
    degradationMachine.setFloorTier(DegradationTier.Passthrough);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    degradationMachine.recordProbeResult(true);
    degradationMachine.recordProbeResult(true);
    degradationMachine.recordProbeResult(true);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  it('[P0] floor IntentReduced allows Passthrough downgrade but blocks upgrade', () => {
    degradationMachine.setFloorTier(DegradationTier.IntentReduced);
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] transition reason is recorded correctly', () => {
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(false);
    }
    const reason = degradationMachine.getTransitionReason();
    expect(reason).not.toBeNull();
    expect(reason!.from).toBe(DegradationTier.Full);
    expect(reason!.to).toBe(DegradationTier.IntentReduced);
    expect(reason!.reason).toContain('consecutive probe failures');
    expect(reason!.timestamp).toBeTypeOf('string');
  });

  it('[P1] tierHistory tracks all transitions', () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(false);
    }
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(true);
    }
    const reason = degradationMachine.getTransitionReason();
    expect(reason).not.toBeNull();
    expect(reason!.from).toBe(DegradationTier.IntentReduced);
    expect(reason!.to).toBe(DegradationTier.Full);
  });

  it('[P1] reset() returns to Full and clears history', () => {
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    degradationMachine.reset();
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    expect(degradationMachine.getTransitionReason()).toBeNull();
  });

  it('[P1] interleaved failures and successes: 1 fail, 1 success, 3 failures → 1 step degrade only', () => {
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(true);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P2] rapid probe calls do not corrupt state', () => {
    const results: DegradationTier[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(degradationMachine.recordProbeResult(i % 2 === 0));
    }
    expect(degradationMachine.getCurrentTier()).toBeTypeOf('string');
    expect(results.length).toBe(100);
  });
});
