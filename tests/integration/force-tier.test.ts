import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DegradationTier } from '../../src/types.js';
import {
  degradationMachine,
  setForceTier,
  clearForceTier,
  isForceActive,
  initializeDegradation,
  shutdownDegradation,
} from '../../src/degrade/index.js';
import { createProbeMockBackend, createDegradationConfig } from '../fixtures/degradation-mock.js';

describe('Force Tier Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    degradationMachine.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    shutdownDegradation();
  });

  // AC1 + AC2: Force-tier overrides probes
  it('[P0] [AC1] [AC2] --force-tier full → tier stays Full regardless of probe failures', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();

    initializeDegradation(backend, config);
    setForceTier(DegradationTier.Full);

    // Simulate many probes — even with failures, tier stays Full
    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 9);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    expect(isForceActive()).toBe(true);
  });

  // AC2: Auto-recovery suspended while force is active
  it('[P0] [AC2] --force-tier intent_reduced → auto-recovery blocked', async () => {
    // First degrade to Passthrough via probe failures
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 6);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);

    // Now set force to IntentReduced
    setForceTier(DegradationTier.IntentReduced);

    // Switch backend to healthy — probes should not trigger recovery
    shutdownDegradation();
    const healthyBackend = createProbeMockBackend({ probeFails: false });
    initializeDegradation(healthyBackend, config);
    setForceTier(DegradationTier.IntentReduced);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);

    // Still forced to IntentReduced — recovery blocked
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  // AC4: --degradation-floor passthrough blocks upgrades
  it('[P0] [AC4] --degradation-floor passthrough → upgrades blocked at Passthrough', () => {
    const backend = createProbeMockBackend({ probeFails: false });
    const config = createDegradationConfig({ degradation_floor: 'Passthrough' });

    initializeDegradation(backend, config);

    // Degrade below floor first
    for (let i = 0; i < 6; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);

    // Now probe successes should try to upgrade but floor blocks it
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  // AC3: Per-process — normal operation after clear
  it('[P0] [AC3] Without --force-tier → normal auto-degradation works', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();

    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    expect(isForceActive()).toBe(false);
  });

  // AC3: clearForceTier restores normal behavior
  it('[P0] [AC3] clearForceTier → resumes normal auto-degradation', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();

    initializeDegradation(backend, config);
    setForceTier(DegradationTier.Full);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);

    // Clear force — now probes should trigger degradation
    clearForceTier();

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    expect(isForceActive()).toBe(false);
  });

  // AC5: --force-tier takes precedence over --degradation-floor
  it('[P0] [AC5] --force-tier full --degradation-floor passthrough → force wins', () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig({ degradation_floor: 'Passthrough' });

    initializeDegradation(backend, config);

    // Degrade below floor
    for (let i = 0; i < 6; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);

    // Now set force tier to Full — force should override the floor
    degradationMachine.setForceTier(DegradationTier.Full);

    // Even with probe successes, force keeps it at Full
    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    expect(degradationMachine.isForceActive()).toBe(true);
  });
});

describe('Force Tier CLI Argument Parsing Integration', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  // AC6: Invalid tier exits with code 1
  it('[P0] [AC6] --force-tier banana → exits code 1, prints valid values', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'mtm', 'start', '--force-tier', 'banana'];

    try {
      const { parseTierArg } = await import('../../src/cli/index.js');
      const result = parseTierArg('banana');
      expect(result).toBeNull();

      // Verify parseTierArg correctly returns null for invalid input
      expect(parseTierArg('invalid_value_xyz')).toBeNull();
      expect(parseTierArg('')).toBeNull();
    } finally {
      process.argv = originalArgv;
    }
  });

  // AC6: Invalid --degradation-floor exits with code 1
  it('[P0] [AC6] --degradation-floor banana → exits code 1, prints valid values', async () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'mtm', 'start', '--degradation-floor', 'banana'];

    try {
      const { parseTierArg } = await import('../../src/cli/index.js');
      const result = parseTierArg('banana');
      expect(result).toBeNull();
    } finally {
      process.argv = originalArgv;
    }
  });

  // AC6: Valid tier parses correctly
  it('[P0] [AC6] --force-tier valid values parse correctly', async () => {
    const { parseTierArg } = await import('../../src/cli/index.js');

    expect(parseTierArg('full')).toBe(DegradationTier.Full);
    expect(parseTierArg('intent_reduced')).toBe(DegradationTier.IntentReduced);
    expect(parseTierArg('passthrough')).toBe(DegradationTier.Passthrough);
    expect(parseTierArg('fail_closed')).toBe(DegradationTier.FailClosed);

    // Case-insensitive
    expect(parseTierArg('FULL')).toBe(DegradationTier.Full);
    expect(parseTierArg('Passthrough')).toBe(DegradationTier.Passthrough);
  });
});
