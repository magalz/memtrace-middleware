import { describe, it, expect, beforeEach } from 'vitest';
import { buildTelemetryResponse } from '../../../src/telemetry/api.js';
import { metrics } from '../../../src/telemetry/metrics.js';
import { resetColdStartDetector } from '../../../src/telemetry/cold-start.js';

describe('buildTelemetryResponse', () => {
  beforeEach(() => {
    metrics.reset();
    resetColdStartDetector();
  });

  it('[P0] [AC3] cold start — returns cold_start: true with empty metrics arrays when no dispatches recorded', () => {
    const response = buildTelemetryResponse();

    expect(response.schema_version).toBe('1.0');
    expect(response.cold_start).toBe(true);
    expect(typeof response.timestamp).toBe('string');

    expect(response.query_success_rate).toEqual({});
    expect(Object.keys(response.latency_percentiles.per_intent).length).toBe(0);
    expect(Object.keys(response.confidence_distribution).length).toBe(0);

    expect(response.memtrace_uptime.probe_success_rate).toBe(0);
    expect(response.memtrace_uptime.total_probes).toBe(0);

    expect(response.buffer_utilization_pct).toBeGreaterThanOrEqual(0);
    expect(response.uptime_seconds).toBeGreaterThanOrEqual(0);
    expect(response.active_intents).toEqual([]);
  });

  it('[P0] [AC2] populated response — returns all 5 core KPI sections after dispatches', () => {
    // Dispatch enough times to exit cold start (COLD_START_DISPATCH_COUNT = 5)
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    metrics.recordDispatch(true, 'find_code', 0.85, 200, 'warm');
    metrics.recordDispatch(false, 'get_impact', 0.7, 150, 'warm');
    metrics.recordDispatch(true, 'find_code', 0.9, 80, 'warm');
    metrics.recordDispatch(true, 'get_impact', 0.95, 120, 'warm');

    const response = buildTelemetryResponse();

    expect(response.schema_version).toBe('1.0');
    expect(response.cold_start).toBe(false);

    // 1. query_success_rate
    expect(response.query_success_rate['find_code']).toBeDefined();
    expect(response.query_success_rate['find_code'].success).toBe(3);
    expect(response.query_success_rate['find_code'].failure).toBe(0);
    expect(response.query_success_rate['find_code'].total).toBe(3);
    expect(response.query_success_rate['find_code'].rate).toBe(1.0);

    expect(response.query_success_rate['get_impact']).toBeDefined();
    expect(response.query_success_rate['get_impact'].success).toBe(1);
    expect(response.query_success_rate['get_impact'].failure).toBe(1);
    expect(response.query_success_rate['get_impact'].rate).toBe(0.5);

    // 2. override_frequency
    expect(response.override_frequency).toBeDefined();

    // 3. latency_percentiles
    expect(response.latency_percentiles.global).toBeDefined();
    expect(typeof response.latency_percentiles.global.p50_ms).toBe('number');
    expect(typeof response.latency_percentiles.global.p95_ms).toBe('number');
    expect(typeof response.latency_percentiles.global.p99_ms).toBe('number');
    expect(Object.keys(response.latency_percentiles.per_intent).length).toBeGreaterThan(0);

    // 4. memtrace_uptime
    expect(response.memtrace_uptime).toBeDefined();
    expect(typeof response.memtrace_uptime.probe_success_rate).toBe('number');

    // 5. confidence_distribution
    expect(response.confidence_distribution).toBeDefined();
  });

  it('[P0] [AC4] schema_version is always "1.0"', () => {
    const response = buildTelemetryResponse();
    expect(response.schema_version).toBe('1.0');
  });

  it('[P1] [AC2] latency_percentiles.global has correct keys', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    const response = buildTelemetryResponse();
    expect(response.latency_percentiles.global).toHaveProperty('p50_ms');
    expect(response.latency_percentiles.global).toHaveProperty('p95_ms');
    expect(response.latency_percentiles.global).toHaveProperty('p99_ms');
  });

  it('[P1] single dispatch — per-intent stats show one entry', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    const response = buildTelemetryResponse();
    expect(response.query_success_rate['find_code'].total).toBe(1);
    expect(Object.keys(response.query_success_rate).length).toBe(1);
  });

  it('[P1] memtrace_uptime reflects probe history', () => {
    // Simulate probes via the metrics directly
    metrics.recordProbe(true);
    metrics.recordProbe(true);
    metrics.recordProbe(false);

    const response = buildTelemetryResponse();
    expect(response.memtrace_uptime.total_probes).toBe(3);
    expect(response.memtrace_uptime.successful_probes).toBe(2);
    expect(response.memtrace_uptime.probe_success_rate).toBeGreaterThan(0);
  });

  it('[P1] [Story 9.2] includes p50_history field after dispatches', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100, 'warm');

    const response = buildTelemetryResponse();
    expect(response).toHaveProperty('p50_history');
    expect(Array.isArray(response.p50_history)).toBe(true);
  });

  it('[P1] [Story 9.2] p50_history is empty array before any dispatches', () => {
    const response = buildTelemetryResponse();
    expect(response.p50_history).toEqual([]);
  });

  it('[P1] [Story 9.3] includes pruning field (null when no pruning)', () => {
    const response = buildTelemetryResponse();
    expect(response).toHaveProperty('pruning');
    expect(response.pruning).toBeNull();
  });

  it('[P1] [Story 9.3] pruning field populated after recordPruning', () => {
    const stats = { pruned_count: 15, retained_count: 7, recency_count: 5, structural_count: 2, memfleet_count: 0, tokens_saved_estimate: 90 };
    metrics.recordPruning(stats);
    const response = buildTelemetryResponse();
    expect(response.pruning).toEqual(stats);
  });
});
