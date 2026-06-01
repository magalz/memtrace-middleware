import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PROBE_INTERVAL_MS } from '../../../src/constants.js';
import { degradationMachine } from '../../../src/degrade/machine.js';
import { ProbeTimer } from '../../../src/degrade/probe-timer.js';
import { DegradationTier } from '../../../src/types.js';

function createMockBackend(opts: { probeResult?: boolean; shouldThrow?: boolean }) {
  return {
    execute: async () => ({
      tool: 'memtrace_find_code',
      data: [],
      trace_id: 't1',
      elapsed_ms: 10,
      degraded: false,
    }),
    probe: async () => {
      if (opts.shouldThrow) {
        throw new Error('simulated backend failure');
      }
      return opts.probeResult ?? true;
    },
    listTools: async () => [],
  };
}

describe('ProbeTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    degradationMachine.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('[P0] timer starts and calls probe() on interval', () => {
    const mock = createMockBackend({ probeResult: true });
    const timer = new ProbeTimer(mock, degradationMachine);
    const probeSpy = vi.spyOn(mock, 'probe');

    timer.start(PROBE_INTERVAL_MS);
    vi.advanceTimersByTime(PROBE_INTERVAL_MS);

    expect(probeSpy).toHaveBeenCalledTimes(1);
    timer.stop();
  });

  it('[P0] probe failure is recorded as failure in machine', async () => {
    const mock = createMockBackend({ probeResult: false });
    const timer = new ProbeTimer(mock, degradationMachine);

    timer.start(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 3);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    timer.stop();
  });

  it('[P0] probe success is recorded as success', async () => {
    const mock = createMockBackend({ probeResult: true });
    const timer = new ProbeTimer(mock, degradationMachine);
    const recordSpy = vi.spyOn(degradationMachine, 'recordProbeResult');

    timer.start(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS);

    expect(recordSpy).toHaveBeenCalledWith(true);
    timer.stop();
  });

  it('[P1] stop() stops the interval', () => {
    const mock = createMockBackend({ probeResult: true });
    const timer = new ProbeTimer(mock, degradationMachine);
    const probeSpy = vi.spyOn(mock, 'probe');

    timer.start(PROBE_INTERVAL_MS);
    timer.stop();
    vi.advanceTimersByTime(PROBE_INTERVAL_MS * 3);

    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('[P1] restart() changes interval', () => {
    const mock = createMockBackend({ probeResult: true });
    const timer = new ProbeTimer(mock, degradationMachine);
    const probeSpy = vi.spyOn(mock, 'probe');

    timer.start(1000);
    timer.restart(2000);

    vi.advanceTimersByTime(1000);
    expect(probeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(probeSpy).toHaveBeenCalledTimes(1);

    timer.stop();
  });

  it('[P1] probe() that throws is treated as failure', async () => {
    const mock = createMockBackend({ shouldThrow: true });
    const timer = new ProbeTimer(mock, degradationMachine);

    timer.start(PROBE_INTERVAL_MS);
    await vi.advanceTimersByTimeAsync(PROBE_INTERVAL_MS * 3);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
    timer.stop();
  });

  it('[P2] isRunning() returns correct state', () => {
    const mock = createMockBackend({ probeResult: true });
    const timer = new ProbeTimer(mock, degradationMachine);

    expect(timer.isRunning()).toBe(false);
    timer.start(PROBE_INTERVAL_MS);
    expect(timer.isRunning()).toBe(true);
    timer.stop();
    expect(timer.isRunning()).toBe(false);
  });
});
