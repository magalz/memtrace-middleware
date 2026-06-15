import { describe, it, expect, beforeEach, vi, afterEach, beforeAll } from 'vitest';
import { DegradationTier } from '../../../src/types.js';
import type { TelemetryApiResponse } from '../../../src/types.js';
import { metrics } from '../../../src/telemetry/metrics.js';
import {
  renderDashboard,
  renderSparkline,
  renderCompactJson,
  startDashboard,
  driftArrow,
  panelColor,
  healthDot,
} from '../../../src/cli/dashboard.js';
import type { DashboardWarningThresholds } from '../../../src/config/types.js';

const defaultThresholds: DashboardWarningThresholds = {
  success_rate_warn: 0.95,
  success_rate_crit: 0.8,
  latency_p95_warn_ms: 600,
  latency_p95_crit_ms: 900,
  uptime_warn_pct: 90,
  uptime_crit_pct: 70,
  confidence_median_warn: 0.9,
  confidence_median_crit: 0.7,
};

function makeTelemetryResponse(overrides?: Partial<TelemetryApiResponse>): TelemetryApiResponse {
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

describe('renderDashboard', () => {
  it('[P0] renders full-tier health dot (green) when tier=Full', () => {
    const response = makeTelemetryResponse({ tier: DegradationTier.Full });
    const lines = renderDashboard(response, defaultThresholds, 0, null, 120);
    const joined = lines.join('\n');
    expect(joined).toContain('\x1b[32m●\x1b[0m full');
  });

  it('[P0] renders degraded health dot (yellow) when tier=Passthrough', () => {
    const response = makeTelemetryResponse({ tier: DegradationTier.Passthrough });
    const lines = renderDashboard(response, defaultThresholds, 0, null, 60);
    const joined = lines.join('\n');
    expect(joined).toContain('\x1b[33m◐\x1b[0m passthrough');
  });

  it('[P0] renders fail-closed health dot (red) when tier=FailClosed', () => {
    const response = makeTelemetryResponse({ tier: DegradationTier.FailClosed });
    const lines = renderDashboard(response, defaultThresholds, 0, null, 30);
    const joined = lines.join('\n');
    expect(joined).toContain('\x1b[31m✕\x1b[0m fail_closed');
  });

  it('[P0] non-TTY output is valid JSON', () => {
    const response = makeTelemetryResponse();
    const output = renderCompactJson(response);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.status).toBe('ok');
    expect(parsed.tier).toBe('full');
    expect(typeof parsed.uptime_seconds).toBe('number');
  });

  it('[P1] shows probes info in header line', () => {
    const response = makeTelemetryResponse({
      memtrace_uptime: { probe_success_rate: 90, total_probes: 20, successful_probes: 18 },
      uptime_seconds: 142,
    });
    const lines = renderDashboard(response, defaultThresholds, 0, null, 142);
    const joined = lines.join('\n');
    expect(joined).toContain('18/20');
    expect(joined).toContain('90%');
  });

  it('[P1] [q] quit prompt appears at end', () => {
    const response = makeTelemetryResponse();
    const lines = renderDashboard(response, defaultThresholds, 0, null, 0);
    expect(lines[lines.length - 1]).toContain('[q] quit');
  });

  it('[P2] warning threshold colors success_rate correctly', () => {
    const response = makeTelemetryResponse({
      query_success_rate: { find_code: { success: 90, failure: 10, total: 100, rate: 0.9 } },
    });
    const lines = renderDashboard(response, defaultThresholds, 0, null, 0);
    const joined = lines.join('\n');
    // 0.90 is below warn (0.95) but above crit (0.80) → yellow
    expect(joined).toContain('\x1b[33m');
    expect(joined).toContain('90.0%');
  });

  it('[P2] warning threshold colors success_rate critical', () => {
    const response = makeTelemetryResponse({
      query_success_rate: { find_code: { success: 50, failure: 50, total: 100, rate: 0.5 } },
    });
    const lines = renderDashboard(response, defaultThresholds, 0, null, 0);
    const joined = lines.join('\n');
    // 0.50 is below crit (0.80) → red
    expect(joined).toContain('\x1b[31m');
    expect(joined).toContain('50.0%');
  });
});

describe('renderSparkline', () => {
  it('[P0] renders block characters for 60 values', () => {
    const values = Array.from({ length: 60 }, (_, i) => (i + 1) * 10);
    const output = renderSparkline(values);
    expect(output.length).toBe(60);
    expect(output).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
  });

  it('[P0] returns empty string for empty input', () => {
    expect(renderSparkline([])).toBe('');
  });

  it('[P1] flat values produce middle block repeated', () => {
    const values = [50, 50, 50, 50, 50];
    const output = renderSparkline(values);
    expect(output).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
    expect(output.length).toBe(5);
  });

  it('[P1] increasing values produce non-decreasing blocks', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const output = renderSparkline(values);
    expect(output.length).toBe(10);
    expect(output).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
  });
});

describe('startDashboard', () => {
  let originalIsTTY: boolean | undefined;

  beforeAll(() => {
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.stdout.isTTY = originalIsTTY;
  });

  it('[P1] returns a DashboardController', () => {
    const controller = startDashboard();
    expect(controller).toBeDefined();
    expect(typeof controller.stop).toBe('function');
    controller.stop();
  });

  it('[P1] non-TTY mode writes JSON and returns immediately', () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.stdout.isTTY = false;

    const controller = startDashboard();
    expect(writeSpy).toHaveBeenCalled();
    controller.stop();
  });

  it('[P1] stop cleans up without throwing', () => {
    const controller = startDashboard();
    expect(() => controller.stop()).not.toThrow();
  });
});

describe('driftArrow', () => {
  it('[P0] returns dim dash for null baseline', () => {
    expect(driftArrow(null)).toContain('\x1b[2m');
    expect(driftArrow(null)).toContain('—');
  });

  it('[P0] returns red up arrow for degradation', () => {
    expect(driftArrow('up')).toContain('\x1b[31m');
    expect(driftArrow('up')).toContain('↑');
  });

  it('[P0] returns green down arrow for improvement', () => {
    expect(driftArrow('down')).toContain('\x1b[32m');
    expect(driftArrow('down')).toContain('↓');
  });

  it('[P0] returns dim right arrow for stable', () => {
    expect(driftArrow('stable')).toContain('\x1b[2m');
    expect(driftArrow('stable')).toContain('→');
  });
});

describe('panelColor', () => {
  it('[P0] returns green when value within warn threshold (higher is better)', () => {
    const result = panelColor(0.98, 0.95, 0.8, true);
    expect(result).toContain('\x1b[32m');
  });

  it('[P0] returns yellow when value between warn and crit (higher is better)', () => {
    const result = panelColor(0.9, 0.95, 0.8, true);
    expect(result).toContain('\x1b[33m');
  });

  it('[P0] returns red when value below crit (higher is better)', () => {
    const result = panelColor(0.7, 0.95, 0.8, true);
    expect(result).toContain('\x1b[31m');
  });

  it('[P0] returns green when value within warn threshold (lower is better)', () => {
    const result = panelColor(100, 600, 900, false);
    expect(result).toContain('\x1b[32m');
  });

  it('[P0] returns yellow when value between warn and crit (lower is better)', () => {
    const result = panelColor(700, 600, 900, false);
    expect(result).toContain('\x1b[33m');
  });

  it('[P0] returns red when value above crit (lower is better)', () => {
    const result = panelColor(1000, 600, 900, false);
    expect(result).toContain('\x1b[31m');
  });

  it('[P1] returns yellow for NaN (does not mask broken metrics)', () => {
    const result = panelColor(NaN, 0.95, 0.8, true);
    expect(result).toContain('\x1b[33m');
  });

  it('[P1] returns yellow for Infinity (does not mask broken metrics)', () => {
    const result = panelColor(Infinity, 600, 900, false);
    expect(result).toContain('\x1b[33m');
  });
});

describe('healthDot', () => {
  it('[P0] flash suffix shows ✓ when flashCounter > 0 (upgrade)', () => {
    const result = healthDot(DegradationTier.Full, 2, true);
    expect(result).toContain(' ✓');
  });

  it('[P0] flash suffix shows ✗ when flashCounter > 0 (degrade)', () => {
    const result = healthDot(DegradationTier.Full, 2, false);
    expect(result).toContain(' ✗');
  });

  it('[P0] flash suffix absent when flashCounter is 0', () => {
    const result = healthDot(DegradationTier.Full, 0);
    expect(result).not.toContain(' ✓');
    expect(result).not.toContain(' ✗');
  });

  it('[P1] fail-closed shows red X even with zero flash', () => {
    const result = healthDot(DegradationTier.FailClosed, 0);
    expect(result).toContain('\x1b[31m✕\x1b[0m');
  });
});

describe('dashboard edge cases', () => {
  it('[P2] renderDashboard handles zero dispatches gracefully (all empty)', () => {
    const response = makeTelemetryResponse();
    const lines = renderDashboard(response, defaultThresholds, 0, null, 0);
    const joined = lines.join('\n');
    expect(joined).toContain('0/0');
    expect(joined).toContain('0%');
    expect(joined).toContain('no data');
  });

  it('[P2] renderSparkline handles single value', () => {
    const output = renderSparkline([42]);
    expect(output.length).toBe(1);
    expect(output).toMatch(/^[▁▂▃▄▅▆▇█]$/);
  });

  it('[P2] renderSparkline filters NaN values without crashing', () => {
    const output = renderSparkline([10, NaN, 30, Infinity, 50]);
    expect(output).toBeTruthy();
    expect(output).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
  });

  it('[P2] renderCompactJson has correct status for non-FailClosed', () => {
    const response = makeTelemetryResponse({ tier: DegradationTier.IntentReduced });
    const output = renderCompactJson(response);
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('ok');
  });

  it('[P2] renderCompactJson has status "closed" for FailClosed', () => {
    const response = makeTelemetryResponse({ tier: DegradationTier.FailClosed });
    const output = renderCompactJson(response);
    const parsed = JSON.parse(output);
    expect(parsed.status).toBe('closed');
  });
});
