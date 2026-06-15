import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { createLogger } from '../logger.js';
import { buildTelemetryResponse } from './api.js';
import type { TelemetryApiResponse } from '../types.js';

const log = createLogger('baseline');

const BASELINE_FILE = join(homedir(), '.memtrace', 'baseline.json');

export interface BaselineDrift {
  query_success_rate: 'up' | 'down' | 'stable';
  latency_p95: 'up' | 'down' | 'stable';
  confidence_median: 'up' | 'down' | 'stable';
  uptime_probe_rate: 'up' | 'down' | 'stable';
  override_count: 'up' | 'down' | 'stable';
}

const DRIFT_THRESHOLD = 0.05;

// Returns drift relative to baseline: 'up' = value increased (may be good or bad),
// 'down' = value decreased (may be good or bad). The caller (driftArrow) maps
// these to red/green arrows based on whether higher-is-better for that metric.
function compareDelta(
  current: number,
  baseline: number,
  higherIsBetter: boolean
): 'up' | 'down' | 'stable' {
  const ratio = baseline > 0 ? current / baseline : current > 0 ? 2 : 1;
  if (ratio > 1 + DRIFT_THRESHOLD) {
    return higherIsBetter ? 'down' : 'up';
  }
  if (ratio < 1 - DRIFT_THRESHOLD) {
    return higherIsBetter ? 'up' : 'down';
  }
  return 'stable';
}

function computePerIntentDrift(
  current: Record<string, { rate: number }>,
  baseline: Record<string, { rate: number }>
): 'up' | 'down' | 'stable' {
  const currentKeys = Object.keys(current);
  const baselineKeys = Object.keys(baseline);
  if (currentKeys.length === 0 && baselineKeys.length === 0) return 'stable';
  const avgCurrent =
    currentKeys.length > 0
      ? Object.values(current).reduce((s, v) => s + v.rate, 0) / currentKeys.length
      : 0;
  const avgBaseline =
    baselineKeys.length > 0
      ? Object.values(baseline).reduce((s, v) => s + v.rate, 0) / baselineKeys.length
      : 0;
  return compareDelta(avgCurrent, avgBaseline, true);
}

function computeOverrideDrift(
  current: { total_overrides: number },
  baseline: { total_overrides: number }
): 'up' | 'down' | 'stable' {
  return compareDelta(current.total_overrides, baseline.total_overrides, false);
}

function computeUptimeDrift(
  current: { probe_success_rate: number },
  baseline: { probe_success_rate: number }
): 'up' | 'down' | 'stable' {
  return compareDelta(current.probe_success_rate, baseline.probe_success_rate, true);
}

function computeLatencyDrift(
  current: TelemetryApiResponse['latency_percentiles'],
  baseline: TelemetryApiResponse['latency_percentiles']
): 'up' | 'down' | 'stable' {
  return compareDelta(current.global.p95_ms, baseline.global.p95_ms, false);
}

function computeConfidenceDrift(
  current: TelemetryApiResponse['confidence_distribution'],
  baseline: TelemetryApiResponse['confidence_distribution']
): 'up' | 'down' | 'stable' {
  const currentKeys = Object.keys(current);
  const baselineKeys = Object.keys(baseline);
  if (currentKeys.length === 0 && baselineKeys.length === 0) return 'stable';
  const avgCurrent =
    currentKeys.length > 0
      ? Object.values(current).reduce((s, v) => s + v.p50, 0) / currentKeys.length
      : 0;
  const avgBaseline =
    baselineKeys.length > 0
      ? Object.values(baseline).reduce((s, v) => s + v.p50, 0) / baselineKeys.length
      : 0;
  return compareDelta(avgCurrent, avgBaseline, true);
}

export function saveBaseline(): boolean {
  try {
    const response = buildTelemetryResponse();
    const dir = join(homedir(), '.memtrace');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(BASELINE_FILE, JSON.stringify(response, null, 2), 'utf-8');
    log.info('baseline_saved', { path: BASELINE_FILE });
    return true;
  } catch (err: unknown) {
    log.error('baseline_save_failed', {
      path: BASELINE_FILE,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

function isValidBaseline(data: unknown): data is TelemetryApiResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.schema_version === 'string' &&
    typeof obj.query_success_rate === 'object' &&
    obj.query_success_rate !== null &&
    typeof obj.latency_percentiles === 'object' &&
    obj.latency_percentiles !== null &&
    typeof obj.memtrace_uptime === 'object' &&
    obj.memtrace_uptime !== null &&
    typeof obj.confidence_distribution === 'object' &&
    obj.confidence_distribution !== null &&
    typeof obj.override_frequency === 'object' &&
    obj.override_frequency !== null
  );
}

export function loadBaseline(): TelemetryApiResponse | null {
  if (!existsSync(BASELINE_FILE)) {
    return null;
  }
  try {
    const raw = readFileSync(BASELINE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!isValidBaseline(parsed)) {
      log.warn('baseline_invalid_schema', { path: BASELINE_FILE });
      return null;
    }
    return parsed;
  } catch {
    log.warn('baseline_load_failed', { path: BASELINE_FILE });
    return null;
  }
}

export function computeDrift(
  current: TelemetryApiResponse,
  baseline: TelemetryApiResponse
): BaselineDrift {
  return {
    query_success_rate: computePerIntentDrift(
      current.query_success_rate,
      baseline.query_success_rate
    ),
    latency_p95: computeLatencyDrift(current.latency_percentiles, baseline.latency_percentiles),
    confidence_median: computeConfidenceDrift(
      current.confidence_distribution,
      baseline.confidence_distribution
    ),
    uptime_probe_rate: computeUptimeDrift(current.memtrace_uptime, baseline.memtrace_uptime),
    override_count: computeOverrideDrift(current.override_frequency, baseline.override_frequency),
  };
}
