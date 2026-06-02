import { describe, it, expect, beforeEach } from 'vitest';

import { HYSTERESIS_PROBE_COUNT } from '../../../src/constants.js';
import { degradationMachine } from '../../../src/degrade/machine.js';
import { DegradationTier } from '../../../src/types.js';

describe('DegradationMachine — force-tier', () => {
  beforeEach(() => {
    degradationMachine.reset();
  });

  // Task 4.1: setForceTier → getCurrentTier returns forced tier
  it('setForceTier → getCurrentTier returns forced tier (not auto tier)', () => {
    // Given: machine degraded to IntentReduced
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);

    // When: force tier is set to Full
    degradationMachine.setForceTier(DegradationTier.Full);

    // Then: getCurrentTier returns Full (forced tier), not IntentReduced
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  // Task 4.2: recordProbeResult ignores failures when force active
  it('recordProbeResult ignores failures when force is active — tier does not change', () => {
    // Given: force tier is set to Full
    degradationMachine.setForceTier(DegradationTier.Full);

    // When: probe failures arrive
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 3; i++) {
      degradationMachine.recordProbeResult(false);
    }

    // Then: tier stays at Full (forced), not degraded
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  // Task 4.3: recordProbeResult ignores successes when force active
  it('recordProbeResult ignores successes when force is active — auto-recovery suspended', () => {
    // Given: machine degraded to Passthrough, force set to IntentReduced
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 2; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
    degradationMachine.setForceTier(DegradationTier.IntentReduced);

    // When: probe successes arrive
    for (let i = 0; i < HYSTERESIS_PROBE_COUNT * 2; i++) {
      degradationMachine.recordProbeResult(true);
    }

    // Then: tier stays at IntentReduced (forced), recovery blocked
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  // Task 4.4: clearForceTier → getCurrentTier returns pre-force tier
  it('clearForceTier → getCurrentTier returns the tier that was last set before force', () => {
    // Given: machine in Full tier, forced to FailClosed
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    degradationMachine.setForceTier(DegradationTier.FailClosed);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.FailClosed);

    // When: force is cleared
    degradationMachine.clearForceTier();

    // Then: getCurrentTier returns Full (the pre-force tier)
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  // Task 4.5: isForceActive returns correct state
  it('isForceActive returns true after setForceTier, false after clearForceTier', () => {
    // Given: no force active
    expect(degradationMachine.isForceActive()).toBe(false);

    // When: force tier is set
    degradationMachine.setForceTier(DegradationTier.Passthrough);

    // Then: isForceActive returns true
    expect(degradationMachine.isForceActive()).toBe(true);

    // When: force is cleared
    degradationMachine.clearForceTier();

    // Then: isForceActive returns false
    expect(degradationMachine.isForceActive()).toBe(false);
  });

  // Task 4.6: reset() clears force tier
  it('reset() clears force tier (isForceActive → false, getCurrentTier → Full)', () => {
    // Given: force tier is set to IntentReduced
    degradationMachine.setForceTier(DegradationTier.IntentReduced);
    expect(degradationMachine.isForceActive()).toBe(true);

    // When: reset is called
    degradationMachine.reset();

    // Then: force is cleared and tier is Full
    expect(degradationMachine.isForceActive()).toBe(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  // Task 4.7: force-tier transition does NOT appear in getTransitionReason or tierHistory
  it('force-tier transition does NOT appear in getTransitionReason', () => {
    // Given: machine in Full tier
    // When: force is set (this is not a degradation transition)
    degradationMachine.setForceTier(DegradationTier.Passthrough);

    // Then: getTransitionReason is still null (no real transition occurred)
    expect(degradationMachine.getTransitionReason()).toBeNull();
  });

  // Task 4.8: force-tier survives across 100 rapid recordProbeResult calls
  it('force-tier survives across 100 rapid recordProbeResult calls — tier unchanged', () => {
    // Given: force tier is set to IntentReduced
    degradationMachine.setForceTier(DegradationTier.IntentReduced);

    // When: 100 rapid probe calls arrive (mix of success and failure)
    for (let i = 0; i < 100; i++) {
      degradationMachine.recordProbeResult(i % 2 === 0);
    }

    // Then: tier remains IntentReduced (forced)
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });
});
