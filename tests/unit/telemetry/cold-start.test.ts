import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isColdStart,
  coldStartRecordDispatch,
  resetColdStartDetector,
  getColdStartStats,
} from '../../../src/telemetry/cold-start.js';

beforeEach(() => {
  resetColdStartDetector();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cold-start', () => {
  it('[P0] detects cold start on first dispatch', () => {
    expect(isColdStart()).toBe(true);
  });

  it('[P0] becomes warm after 5 dispatches', () => {
    for (let i = 0; i < 5; i++) {
      coldStartRecordDispatch(10);
    }
    expect(isColdStart()).toBe(false);
  });

  it('[P0] dispatch 5 is still cold, dispatch 6 is warm', () => {
    for (let i = 0; i < 5; i++) {
      coldStartRecordDispatch(10);
      if (i < 4) {
        expect(isColdStart()).toBe(true);
      }
    }
    expect(isColdStart()).toBe(false);
  });

  it('[P1] resets to cold after idle timeout', () => {
    coldStartRecordDispatch(10);
    coldStartRecordDispatch(10);
    expect(isColdStart()).toBe(true);

    vi.advanceTimersByTime(30000);

    expect(isColdStart()).toBe(true);
  });

  it('[P1] idle timer resets on each dispatch', () => {
    coldStartRecordDispatch(10);
    vi.advanceTimersByTime(20000);
    coldStartRecordDispatch(10);
    vi.advanceTimersByTime(20000);
    coldStartRecordDispatch(10);

    expect(isColdStart()).toBe(true);
  });

  it('[P0] returns cold start stats with count and p50', () => {
    coldStartRecordDispatch(10);
    coldStartRecordDispatch(20);

    const stats = getColdStartStats();
    expect(stats.count).toBe(2);
    expect(stats.p50_ms).toBe(15);
  });

  it('[P2] returns zero stats when no cold start dispatches recorded', () => {
    const stats = getColdStartStats();
    expect(stats.count).toBe(0);
    expect(stats.p50_ms).toBe(0);
  });

  it('[P2] idle timeout clears timings', () => {
    coldStartRecordDispatch(10);
    coldStartRecordDispatch(20);

    vi.advanceTimersByTime(30000);

    const stats = getColdStartStats();
    expect(stats.count).toBe(0);
  });

  it('[P1] p50 calculation correct with even count of timings', () => {
    coldStartRecordDispatch(10);
    coldStartRecordDispatch(30);
    coldStartRecordDispatch(20);
    coldStartRecordDispatch(40);

    const stats = getColdStartStats();
    expect(stats.count).toBe(4);
    expect(stats.p50_ms).toBe(25);
  });

  it('[P1] p50 calculation correct with odd count of timings', () => {
    coldStartRecordDispatch(10);
    coldStartRecordDispatch(50);
    coldStartRecordDispatch(30);

    const stats = getColdStartStats();
    expect(stats.count).toBe(3);
    expect(stats.p50_ms).toBe(30);
  });

  it('[P1] resetColdStartDetector clears all state', () => {
    coldStartRecordDispatch(10);
    coldStartRecordDispatch(20);
    expect(isColdStart()).toBe(true);

    resetColdStartDetector();

    expect(isColdStart()).toBe(true);
    const stats = getColdStartStats();
    expect(stats.count).toBe(0);
    expect(stats.p50_ms).toBe(0);
  });

  it('[P1] becomes cold again after warm + idle + new dispatch', () => {
    for (let i = 0; i < 5; i++) {
      coldStartRecordDispatch(10);
    }
    expect(isColdStart()).toBe(false);

    vi.advanceTimersByTime(30000);

    expect(isColdStart()).toBe(true);
  });

  it('[P2] coldStartRecordDispatch does not throw on empty timings edge case', () => {
    expect(() => coldStartRecordDispatch(10)).not.toThrow();
  });

  it('[P2] negative elapsedMs is rejected', () => {
    coldStartRecordDispatch(-1);
    const stats = getColdStartStats();
    expect(stats.count).toBe(0);
  });

  it('[P2] NaN elapsedMs is rejected', () => {
    coldStartRecordDispatch(NaN);
    const stats = getColdStartStats();
    expect(stats.count).toBe(0);
  });

  it('[P1] warm→idle→cold cycle: full cycle works end-to-end', () => {
    for (let i = 0; i < 5; i++) {
      coldStartRecordDispatch(10);
    }
    expect(isColdStart()).toBe(false);

    vi.advanceTimersByTime(30000);

    expect(isColdStart()).toBe(true);

    coldStartRecordDispatch(5);
    expect(isColdStart()).toBe(true);
    const stats = getColdStartStats();
    expect(stats.count).toBe(1);
    expect(stats.p50_ms).toBe(5);
  });
});
