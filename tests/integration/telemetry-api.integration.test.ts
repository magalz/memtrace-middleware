import { describe, it, expect, beforeEach } from 'vitest';
import { buildTelemetryResponse } from '../../src/telemetry/api.js';
import { metrics } from '../../src/telemetry/metrics.js';
import { resetColdStartDetector } from '../../src/telemetry/cold-start.js';

describe('Telemetry API — Integration', () => {
  beforeEach(() => {
    metrics.reset();
    resetColdStartDetector();
  });

  it('[P0] [AC6] MCP-compatible — response is serialisable JSON without circular references', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    const response = buildTelemetryResponse();
    expect(() => JSON.stringify(response)).not.toThrow();
  });

  it('[P0] [AC6] telemetry response shape matches schema for MCP protocol', () => {
    metrics.recordDispatch(true, 'find_code', 0.9, 150, 'warm');
    metrics.recordDispatch(true, 'get_impact', 0.95, 200, 'warm');
    metrics.recordDispatch(false, 'find_code', 0.8, 300, 'warm');

    const response = buildTelemetryResponse();

    // Schema versioned
    expect(response.schema_version).toBe('1.0');

    // Cold-start transitions correctly
    expect(typeof response.cold_start).toBe('boolean');

    // Query success rate is per-intent
    expect(response.query_success_rate['find_code']).toBeDefined();
    expect(response.query_success_rate['get_impact']).toBeDefined();

    // find_code: 1 success, 1 failure → rate = 0.5
    expect(response.query_success_rate['find_code'].success).toBe(1);
    expect(response.query_success_rate['find_code'].failure).toBe(1);
    expect(response.query_success_rate['find_code'].rate).toBe(0.5);

    // get_impact: 1 success, 0 failure → rate = 1.0
    expect(response.query_success_rate['get_impact'].success).toBe(1);
    expect(response.query_success_rate['get_impact'].rate).toBe(1.0);

    // Latency is per-intent with global aggregate
    expect(response.latency_percentiles.per_intent['find_code']).toBeDefined();
    expect(response.latency_percentiles.per_intent['get_impact']).toBeDefined();
    expect(response.latency_percentiles.global.p50_ms).toBeGreaterThanOrEqual(0);

    // active_intents has both intents
    expect(response.active_intents).toContain('find_code');
    expect(response.active_intents).toContain('get_impact');

    // Degradation tier present
    expect(response.tier).toBeDefined();
    expect(typeof response.tier).toBe('string');
  });

  it('[P1] [AC6] cold start to steady state — transitions as soon as any dispatch data exists', () => {
    let response = buildTelemetryResponse();
    expect(response.cold_start).toBe(true);

    // Any dispatch = no longer cold
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');
    response = buildTelemetryResponse();
    expect(response.cold_start).toBe(false);
  });

  it('[P2] [AC6] telemetry works without any Memtrace dependency — no backend needed', () => {
    // buildTelemetryResponse does NOT call backend — it reads module-level state only
    metrics.recordProbe(true);
    const response = buildTelemetryResponse();
    expect(response.memtrace_uptime.total_probes).toBe(1);
    expect(response.active_intents).toBeDefined();
  });
});
