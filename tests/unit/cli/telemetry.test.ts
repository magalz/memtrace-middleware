import { describe, it, expect, vi, beforeEach } from 'vitest';
import { metrics } from '../../../src/telemetry/metrics.js';
import { resetColdStartDetector } from '../../../src/telemetry/cold-start.js';

describe('mtm telemetry CLI', () => {
  beforeEach(() => {
    metrics.reset();
    resetColdStartDetector();
  });

  it('[P0] [AC1] buildTelemetryResponse returns valid TelemetryApiResponse JSON', async () => {
    const { buildTelemetryResponse } = await import('../../../src/telemetry/api.js');
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');

    const response = buildTelemetryResponse();
    expect(response.schema_version).toBe('1.0');
    expect(response.query_success_rate).toBeDefined();
    expect(response.latency_percentiles).toBeDefined();
    expect(response.memtrace_uptime).toBeDefined();
    expect(response.confidence_distribution).toBeDefined();
    expect(response.override_frequency).toBeDefined();
    expect(response.buffer_utilization_pct).toBeGreaterThanOrEqual(0);
  });

  it('[P0] [AC1] telemetry response contains all 5 KPI keys', async () => {
    const { buildTelemetryResponse } = await import('../../../src/telemetry/api.js');
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');

    const response = buildTelemetryResponse();
    const keys = Object.keys(response);

    expect(keys).toContain('query_success_rate');
    expect(keys).toContain('override_frequency');
    expect(keys).toContain('latency_percentiles');
    expect(keys).toContain('memtrace_uptime');
    expect(keys).toContain('confidence_distribution');
    expect(keys).toContain('buffer_utilization_pct');
    expect(keys).toContain('schema_version');
    expect(keys).toContain('cold_start');
    expect(keys).toContain('timestamp');
    expect(keys).toContain('uptime_seconds');
    expect(keys).toContain('tier');
    expect(keys).toContain('active_intents');
  });

  it('[P0] [AC3] cold_start response — query_success_rate is empty object, not null', async () => {
    const { buildTelemetryResponse } = await import('../../../src/telemetry/api.js');
    const response = buildTelemetryResponse();

    expect(response.cold_start).toBe(true);
    expect(response.query_success_rate).not.toBeNull();
    expect(response.latency_percentiles.per_intent).not.toBeNull();
    expect(response.memtrace_uptime).not.toBeNull();
  });

  it('[P1] [AC1] telemetry output roundtrips through JSON parse', async () => {
    const { buildTelemetryResponse } = await import('../../../src/telemetry/api.js');
    metrics.recordDispatch(true, 'find_code', 0.9, 100, 'warm');

    const response = buildTelemetryResponse();
    const json = JSON.stringify(response);
    const parsed = JSON.parse(json);

    expect(parsed.schema_version).toBe('1.0');
    expect(parsed.query_success_rate.find_code.success).toBe(1);
  });

  it('[P2] [AC1] compact flag simulation — object can be stringified', async () => {
    const { buildTelemetryResponse } = await import('../../../src/telemetry/api.js');
    const response = buildTelemetryResponse();
    const compact = JSON.stringify(response);
    const pretty = JSON.stringify(response, null, 2);

    expect(typeof compact).toBe('string');
    expect(typeof pretty).toBe('string');
    expect(compact.length).toBeLessThan(pretty.length);
  });
});
