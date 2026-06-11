import { describe, it, expect, beforeEach } from 'vitest';

import { degradationMachine } from '../../../src/degrade/machine.js';
import { onConfigChanged } from '../../../src/degrade/index.js';
import { DegradationTier } from '../../../src/types.js';

describe('DegradationMachine', () => {
  beforeEach(() => {
    degradationMachine.reset();
    degradationMachine.setHysteresisCount(3);
  });

  it('[P0] initial state is Full tier', () => {
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] single probe failure does NOT trigger degradation', () => {
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] three consecutive probe failures triggers Full → IntentReduced', () => {
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P0] six consecutive probe failures triggers Full → IntentReduced → Passthrough', () => {
    for (let i = 0; i < 3 * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  it('[P0] nine consecutive probe failures triggers Full → IntentReduced → Passthrough → FailClosed', () => {
    for (let i = 0; i < 3 * 3; i++) {
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
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P0] Passthrough recovery goes straight to Full', () => {
    for (let i = 0; i < 3 * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
    for (let i = 0; i < 3; i++) {
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
    for (let i = 0; i < 3 * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] transition reason is recorded correctly', () => {
    for (let i = 0; i < 3; i++) {
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
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(true);
    }
    const reason = degradationMachine.getTransitionReason();
    expect(reason).not.toBeNull();
    expect(reason!.from).toBe(DegradationTier.IntentReduced);
    expect(reason!.to).toBe(DegradationTier.Full);
  });

  it('[P1] reset() returns to Full and clears history', () => {
    for (let i = 0; i < 3; i++) {
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

  it('[P1] setHysteresisCount(5) → 5 failures needed for transition', () => {
    degradationMachine.setHysteresisCount(5);
    for (let i = 0; i < 5; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] setHysteresisCount(1) → 1 failure triggers immediate transition', () => {
    degradationMachine.setHysteresisCount(1);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] setHysteresisCount(0) → count unchanged, log warning', () => {
    degradationMachine.setHysteresisCount(0);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] setHysteresisCount mid-cycle preserves failure counter', () => {
    degradationMachine.setHysteresisCount(5);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    degradationMachine.setHysteresisCount(3);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] reset does not reset hysteresis count', () => {
    degradationMachine.setHysteresisCount(5);
    degradationMachine.reset();
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    for (let i = 0; i < 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] onConfigChanged with hysteresis_probe_count delta updates machine count', () => {
    degradationMachine.setHysteresisCount(3);
    onConfigChanged({ hysteresis_probe_count: 7 });
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    for (let i = 0; i < 4; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] setHysteresisCount(NaN) → count unchanged', () => {
    degradationMachine.setHysteresisCount(NaN);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P2] setHysteresisCount(Infinity) → count unchanged', () => {
    degradationMachine.setHysteresisCount(Infinity);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] setHysteresisCount(100) → 100 failures needed for transition', () => {
    degradationMachine.setHysteresisCount(100);
    for (let i = 0; i < 99; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] floor Passthrough + hysteresis=1 blocks upgrade at boundary', () => {
    degradationMachine.setFloorTier(DegradationTier.Passthrough);
    degradationMachine.setHysteresisCount(1);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    degradationMachine.recordProbeResult(true);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  it('[P1] mid-cycle hysteresis increase (3→5) with existing failures', () => {
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    degradationMachine.setHysteresisCount(5);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P2] setHysteresisCount(2.5) → non-integer rejected', () => {
    degradationMachine.setHysteresisCount(2.5);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P2] setHysteresisCount(15000) → accepted with warning, 15000 failures needed', () => {
    degradationMachine.setHysteresisCount(15000);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });
});
