import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { metrics } from '../../../src/telemetry/metrics.js';
import { saveBaseline, loadBaseline, computeDrift } from '../../../src/telemetry/baseline.js';
import type { TelemetryApiResponse } from '../../../src/types.js';
import { DegradationTier } from '../../../src/types.js';

const BASELINE_FILE = join(homedir(), '.memtrace', 'baseline.json');

function makeResponse(overrides?: Partial<TelemetryApiResponse>): TelemetryApiResponse {
  return {
    schema_version: '1.0',
    cold_start: true,
    timestamp: new Date().toISOString(),
    query_success_rate: {},
    override_frequency: { total_overrides: 0 },
    latency_percentiles: {
      global: { p50_ms: 0, p95_ms: 0, p99_ms: 0 },
      per_intent: {},
    },
    memtrace_uptime: { probe_success_rate: 0, total_probes: 0, successful_probes: 0 },
    confidence_distribution: {},
    p50_history: [],
    buffer_utilization_pct: 0,
    uptime_seconds: 0,
    tier: DegradationTier.Full,
    active_intents: [],
    ...overrides,
  };
}

describe('baseline', () => {
  beforeEach(() => {
    metrics.reset();
    // clean up baseline file before each test
    try {
      if (existsSync(BASELINE_FILE)) {
        unlinkSync(BASELINE_FILE);
      }
    } catch {
      // ignore
    }
  });

  afterEach(() => {
    try {
      if (existsSync(BASELINE_FILE)) {
        unlinkSync(BASELINE_FILE);
      }
    } catch {
      // ignore
    }
  });

  it('[P0] saveBaseline writes valid JSON to baseline file', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100, 'warm');
    saveBaseline();

    expect(existsSync(BASELINE_FILE)).toBe(true);
    const content = JSON.parse(readFileSync(BASELINE_FILE, 'utf-8'));
    expect(content.schema_version).toBe('1.0');
  });

  it('[P0] loadBaseline returns null for missing file', () => {
    const result = loadBaseline();
    expect(result).toBeNull();
  });

  it('[P0] loadBaseline returns parsed data when file exists', () => {
    metrics.recordDispatch(true, 'find_code', 0.95, 100, 'warm');
    saveBaseline();

    const result = loadBaseline();
    expect(result).not.toBeNull();
    expect(result!.schema_version).toBe('1.0');
  });

  it('[P0] loadBaseline returns null for corrupted file', () => {
    mkdirSync(join(homedir(), '.memtrace'), { recursive: true });
    writeFileSync(BASELINE_FILE, 'not valid json', 'utf-8');

    const result = loadBaseline();
    expect(result).toBeNull();
  });

  it('[P0] computeDrift returns stable when values unchanged', () => {
    const current = makeResponse({
      query_success_rate: { find_code: { success: 10, failure: 0, total: 10, rate: 1.0 } },
    });
    const baseline = makeResponse({
      query_success_rate: { find_code: { success: 10, failure: 0, total: 10, rate: 1.0 } },
    });

    const drift = computeDrift(current, baseline);
    expect(drift.query_success_rate).toBe('stable');
  });

  it('[P0] computeDrift detects improvement (down arrow) for success rate', () => {
    const current = makeResponse({
      query_success_rate: { find_code: { success: 10, failure: 0, total: 10, rate: 1.0 } },
    });
    const baseline = makeResponse({
      query_success_rate: { find_code: { success: 5, failure: 5, total: 10, rate: 0.5 } },
    });

    const drift = computeDrift(current, baseline);
    // rate went from 0.5 → 1.0 (improved) → down arrow
    expect(drift.query_success_rate).toBe('down');
  });

  it('[P0] computeDrift detects degradation (up arrow) for latency', () => {
    const current = makeResponse({
      latency_percentiles: {
        global: { p50_ms: 100, p95_ms: 1000, p99_ms: 2000 },
        per_intent: {},
      },
    });
    const baseline = makeResponse({
      latency_percentiles: {
        global: { p50_ms: 50, p95_ms: 100, p99_ms: 200 },
        per_intent: {},
      },
    });

    const drift = computeDrift(current, baseline);
    // p95 went from 100 → 1000 (worse) → up arrow
    expect(drift.latency_p95).toBe('up');
  });

  it('[P1] computeDrift detects stable for small changes within threshold', () => {
    const current = makeResponse({
      query_success_rate: { find_code: { success: 10, failure: 0, total: 10, rate: 1.0 } },
    });
    const baseline = makeResponse({
      query_success_rate: { find_code: { success: 10, failure: 0, total: 10, rate: 0.97 } },
    });

    const drift = computeDrift(current, baseline);
    // 1.0 vs 0.97 = ~3% change, within 5% threshold → stable
    expect(drift.query_success_rate).toBe('stable');
  });
});
