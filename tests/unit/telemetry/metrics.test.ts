import { describe, it, expect, beforeEach } from 'vitest';
import { metrics } from '../../../src/telemetry/metrics.js';
import { DegradationTier } from '../../../src/types.js';
import { buildTelemetryResponse } from '../../../src/telemetry/api.js';
import { RingBuffer } from '../../../src/telemetry/ring-buffer.js';

describe('metrics — latency tracking', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('[P0] recordLatency stores samples per intent type', () => {
    metrics.recordLatency('find_code', 100, false);
    metrics.recordLatency('find_code', 200, false);
    metrics.recordLatency('get_impact', 150, false);

    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent['find_code']).toBeDefined();
    expect(snapshot.per_intent['find_code'].count).toBe(2);
    expect(snapshot.per_intent['get_impact']).toBeDefined();
    expect(snapshot.per_intent['get_impact'].count).toBe(1);
  });

  it('[P0] getLatencySnapshot returns correct percentiles', () => {
    // 10 values: [100,200,300,400,500,600,700,800,900,1000]
    // computePercentile uses floor(N * p) → sorted[5]=600, sorted[9]=1000
    const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    for (const ms of samples) {
      metrics.recordLatency('find_code', ms, false);
    }

    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent['find_code'].p50).toBe(600);
    expect(snapshot.per_intent['find_code'].p95).toBe(1000);
    expect(snapshot.per_intent['find_code'].p99).toBe(1000);
    expect(snapshot.per_intent['find_code'].count).toBe(10);
  });

  it('[P0] recordLatency separates cold-start vs steady-state', () => {
    for (let i = 0; i < 5; i++) {
      metrics.recordLatency('find_code', i * 100, true);
    }
    for (let i = 0; i < 5; i++) {
      metrics.recordLatency('find_code', i * 50, false);
    }

    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.cold_start.count).toBe(5);
    expect(snapshot.steady_state.count).toBe(5);
  });

  it('[P0] getSnapshot includes latency_stats', () => {
    metrics.recordLatency('find_code', 100, false);
    const snapshot = metrics.getSnapshot();
    expect(snapshot.latency_stats).toBeDefined();
    expect(snapshot.latency_stats.per_intent['find_code'].count).toBe(1);
  });

  it('[P0] reset clears all latency data', () => {
    metrics.recordLatency('find_code', 100, false);
    metrics.reset();
    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent).toEqual({});
    expect(snapshot.cold_start.count).toBe(0);
    expect(snapshot.steady_state.count).toBe(0);
  });

  it('[P1] recordDispatch wires elapsedMs to recordLatency', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 150, 'warm');
    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.steady_state.count).toBe(1);
    expect(snapshot.steady_state.p50).toBeGreaterThan(0);
  });

  it('[P1] handles single sample correctly', () => {
    metrics.recordLatency('find_code', 42, false);
    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent['find_code'].p50).toBe(42);
    expect(snapshot.per_intent['find_code'].p95).toBe(42);
    expect(snapshot.per_intent['find_code'].p99).toBe(42);
  });

  it('[P2] ring buffer capacity is bounded at 500', () => {
    for (let i = 0; i < 1000; i++) {
      metrics.recordLatency('find_code', i, false);
    }
    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent['find_code'].count).toBe(500);
  });

  it('[P2] handles negative elapsedMs gracefully', () => {
    metrics.recordLatency('find_code', -1, false);
    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent['find_code']).toBeUndefined();
  });

  it('[P2] handles NaN elapsedMs gracefully', () => {
    metrics.recordLatency('find_code', NaN, false);
    const snapshot = metrics.getLatencySnapshot();
    expect(snapshot.per_intent['find_code']).toBeUndefined();
  });
});

describe('metrics — enhanced tracking (Story 9.1)', () => {
  beforeEach(() => {
    metrics.reset();
  });

  it('[P0] recordDispatch tracks per-intent success counts', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    metrics.recordDispatch(true, 'find_code', 0.85, 120, 'warm');
    metrics.recordDispatch(true, 'get_impact', 0.95, 150, 'warm');

    const successCounts = metrics.getIntentSuccessCounts();
    expect(successCounts.get('find_code')).toBe(2);
    expect(successCounts.get('get_impact')).toBe(1);
  });

  it('[P0] recordDispatch tracks per-intent failure counts', () => {
    metrics.recordDispatch(false, 'find_code', 0.9, 100, 'warm');
    metrics.recordDispatch(false, 'get_impact', 0.95, 150, 'warm');

    const failureCounts = metrics.getIntentFailureCounts();
    expect(failureCounts.get('find_code')).toBe(1);
    expect(failureCounts.get('get_impact')).toBe(1);
  });

  it('[P0] recordDispatch tracks mixed success/failure per intent', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    metrics.recordDispatch(false, 'find_code', 0.9, 100, 'warm');
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');

    expect(metrics.getIntentSuccessCounts().get('find_code')).toBe(2);
    expect(metrics.getIntentFailureCounts().get('find_code')).toBe(1);
  });

  it('[P1] recordForceTierOverride increments override counter', () => {
    metrics.recordForceTierOverride(DegradationTier.Passthrough);
    metrics.recordForceTierOverride(DegradationTier.FailClosed);

    const response = buildTelemetryResponse();
    expect(response.override_frequency.total_overrides).toBe(2);
  });

  it('[P1] recordProbe tracks success for uptime calculation', () => {
    metrics.recordProbe(true);
    metrics.recordProbe(true);
    metrics.recordProbe(false);

    const snapshot = metrics.getProbeBufferSnapshot();
    expect(snapshot.total_probes).toBe(3);
    expect(snapshot.successful_probes).toBe(2);

    const rate = metrics.getProbeSuccessRate();
    expect(rate).toBeCloseTo(66.7, 0);
  });

  it('[P1] getProbeSuccessRate returns 0 when no probes recorded', () => {
    expect(metrics.getProbeSuccessRate()).toBe(0);
  });

  it('[P1] recordDispatch stores per-intent confidence in separate buffers', () => {
    metrics.recordDispatch(true, 'find_code', 0.80, 100, 'warm');
    metrics.recordDispatch(true, 'find_code', 0.90, 100, 'warm');
    metrics.recordDispatch(true, 'get_impact', 0.99, 100, 'warm');

    const confidenceMap = metrics.getConfidenceBufferMap();
    expect(confidenceMap.get('find_code')).toBeDefined();
    expect(confidenceMap.get('get_impact')).toBeDefined();
    expect(confidenceMap.get('find_code')?.toArray().length).toBe(2);
    expect(confidenceMap.get('get_impact')?.toArray().length).toBe(1);
  });

  it('[P1] getBufferUtilizationPct returns between 0 and 100', () => {
    const pct = metrics.getBufferUtilizationPct();
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it('[P1] getBufferUtilizationPct increases as data accumulates', () => {
    const before = metrics.getBufferUtilizationPct();
    for (let i = 0; i < 50; i++) {
      metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    }
    const after = metrics.getBufferUtilizationPct();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('[P2] reset clears enhanced tracking state', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    metrics.recordForceTierOverride(DegradationTier.Passthrough);
    metrics.recordProbe(true);
    metrics.reset();

    expect(metrics.getIntentSuccessCounts().size).toBe(0);
    expect(metrics.getIntentFailureCounts().size).toBe(0);
    expect(metrics.getProbeBufferSnapshot().total_probes).toBe(0);
  });
});
