import { EventEmitter } from 'node:events';

import { getConfigPath } from '../config/loader.js';
import type { DashboardWarningThresholds } from '../config/types.js';
import { getCurrentConfig, watchConfig } from '../config/watcher.js';
import { MIDDLEWARE_VERSION, STATUS_REFRESH_MS } from '../constants.js';
import { buildTelemetryResponse, loadTelemetrySnapshot } from '../telemetry/api.js';
import { loadBaseline, computeDrift } from '../telemetry/baseline.js';
import type { BaselineDrift } from '../telemetry/baseline.js';
import { DegradationTier } from '../types.js';
import type { TelemetryApiResponse } from '../types.js';

const ANSI_RESET = '\x1b[0m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';
const ANSI_BOLD = '\x1b[1m';
const ANSI_DIM = '\x1b[2m';

const FLASH_DURATION = 3;

const SPARKLINE_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

export interface DashboardController {
  stop(): void;
}

export interface DashboardOptions {
  watch?: boolean;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function visualPadEnd(text: string, length: number): string {
  const visible = stripAnsi(text);
  const padLen = Math.max(0, length - visible.length);
  return text + ' '.repeat(padLen);
}

export function healthDot(
  tier: DegradationTier,
  flashCounter: number,
  flashIsUpgrade?: boolean
): string {
  let suffix = '';
  if (flashCounter > 0) {
    suffix = flashIsUpgrade === false ? ' ✗' : ' ✓';
  }
  switch (tier) {
    case DegradationTier.Full:
      return `${ANSI_GREEN}●${ANSI_RESET} full${suffix}`;
    case DegradationTier.IntentReduced:
    case DegradationTier.Passthrough:
      return `${ANSI_YELLOW}◐${ANSI_RESET} ${tier}${suffix}`;
    case DegradationTier.FailClosed:
      return `${ANSI_RED}✕${ANSI_RESET} fail_closed${suffix}`;
  }
}

export function renderSparkline(values: number[]): string {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return '';
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  const range = max - min;
  if (range === 0) {
    return SPARKLINE_BLOCKS[Math.floor(SPARKLINE_BLOCKS.length / 2)]!.repeat(values.length);
  }
  return values
    .map((v) => {
      const idx = Math.floor(((v - min) / range) * (SPARKLINE_BLOCKS.length - 1));
      return SPARKLINE_BLOCKS[Math.min(idx, SPARKLINE_BLOCKS.length - 1)]!;
    })
    .join('');
}

export function driftArrow(drift: 'up' | 'down' | 'stable' | null): string {
  if (drift === null) return `${ANSI_DIM}—${ANSI_RESET}`;
  switch (drift) {
    case 'up':
      return `${ANSI_RED}↑${ANSI_RESET}`;
    case 'down':
      return `${ANSI_GREEN}↓${ANSI_RESET}`;
    case 'stable':
      return `${ANSI_DIM}→${ANSI_RESET}`;
  }
}

export function panelColor(
  value: number,
  warnThreshold: number,
  critThreshold: number,
  higherIsBetter: boolean
): string {
  if (!Number.isFinite(value)) {
    return ANSI_YELLOW;
  }
  if (higherIsBetter) {
    if (value < critThreshold) return ANSI_RED;
    if (value < warnThreshold) return ANSI_YELLOW;
    return ANSI_GREEN;
  }
  if (value > critThreshold) return ANSI_RED;
  if (value > warnThreshold) return ANSI_YELLOW;
  return ANSI_GREEN;
}

export function renderDashboard(
  response: TelemetryApiResponse,
  thresholds: DashboardWarningThresholds,
  flashCounter: number,
  baseline: TelemetryApiResponse | null,
  uptimeSeconds: number,
  flashIsUpgrade?: boolean
): string[] {
  const drift: BaselineDrift | null = baseline ? computeDrift(response, baseline) : null;

  const lines: string[] = [];

  const tier = response.tier;
  const healthLine =
    healthDot(tier, flashCounter, flashIsUpgrade) +
    `  |  uptime: ${uptimeSeconds}s` +
    `  |  probes: ${response.memtrace_uptime.successful_probes}/${response.memtrace_uptime.total_probes} (${response.memtrace_uptime.probe_success_rate}%)`;

  lines.push(healthLine);
  lines.push('─'.repeat(58));

  const intentCount = Object.keys(response.query_success_rate).length;
  const srLines: string[] = [];
  if (intentCount === 0) {
    srLines.push(`  ${ANSI_DIM}no data${ANSI_RESET}`);
  } else {
    const avgSr =
      Object.values(response.query_success_rate).reduce((avg, v) => avg + v.rate, 0) / intentCount;
    const srColor = successRateColor(avgSr, thresholds);
    for (const [intentType, sr] of Object.entries(response.query_success_rate)) {
      srLines.push(`  ${intentType}: ${srColor}${(sr.rate * 100).toFixed(1)}%${ANSI_RESET}`);
    }
  }

  const confLines: string[] = [];
  for (const [intentType, cd] of Object.entries(response.confidence_distribution)) {
    confLines.push(`  ${intentType}: p50=${cd.p50.toFixed(2)}`);
  }

  const leftPanels = [
    `${ANSI_BOLD}✅ success rate${ANSI_RESET}${drift ? ` ${driftArrow(drift.query_success_rate)}` : ''}`,
    ...srLines,
  ];
  const rightPanels = [
    `${ANSI_BOLD}📊 confidence dist${ANSI_RESET}${drift ? ` ${driftArrow(drift.confidence_median)}` : ''}`,
    ...confLines,
  ];

  const maxPanelLines = Math.max(leftPanels.length, rightPanels.length);
  for (let i = 0; i < maxPanelLines; i++) {
    const left = leftPanels[i] ?? '';
    const right = rightPanels[i] ?? '';
    // padEnd(29) may misalign with ANSI codes — cosmetic, two-column layout still functional
    const paddedLeft = visualPadEnd(left, 29);
    lines.push(`${paddedLeft}│  ${right}`);
  }

  lines.push('─'.repeat(58));

  const latencyColorStr = latencyColor(response.latency_percentiles.global.p95_ms, thresholds);
  const latencyDrift = drift ? ` ${driftArrow(drift.latency_p95)}` : '';
  const sparkline = renderSparkline(response.p50_history);
  const latencyLine = `${ANSI_BOLD}⏱️ latency${ANSI_RESET}${latencyDrift}`;
  const latencyDetails = `  p50: ${response.latency_percentiles.global.p50_ms}ms p95: ${latencyColorStr}${response.latency_percentiles.global.p95_ms}ms${ANSI_RESET}`;
  const sparklineLine = sparkline ? `  sparkline: ${sparkline}` : '';

  const overridesDrift = drift ? ` ${driftArrow(drift.override_count)}` : '';
  const overridesLine = `${ANSI_BOLD}⚡ overrides: ${response.override_frequency.total_overrides}${ANSI_RESET}${overridesDrift}`;
  const overridesDetails = '  (cumulative)';

  lines.push(`${visualPadEnd(latencyLine, 29)}│  ${overridesLine}`);
  lines.push(`${visualPadEnd(latencyDetails, 29)}│  ${overridesDetails}`);
  if (sparklineLine) {
    lines.push(`${visualPadEnd(sparklineLine, 29)}│`);
  }

  // Pruning panel
  if (response.pruning) {
    const p = response.pruning;
    const pruningLine = `${ANSI_BOLD}pruning${ANSI_RESET}`;
    const pruningDetails = `  kept: ${p.retained_count} (recency:${p.recency_count} + struct:${p.structural_count}) | ~${p.tokens_saved_estimate} tokens`;
    lines.push(`─`.repeat(58));
    lines.push(pruningLine);
    lines.push(pruningDetails);
  } else {
    lines.push('─'.repeat(58));
    lines.push(
      `${ANSI_BOLD}pruning${ANSI_RESET}${ANSI_DIM} standby (below threshold or disabled)${ANSI_RESET}`
    );
  }

  lines.push('─'.repeat(58));
  lines.push(`${ANSI_DIM}[q] quit${ANSI_RESET}`);

  return lines;
}

function successRateColor(rate: number, thresholds: DashboardWarningThresholds): string {
  return panelColor(rate, thresholds.success_rate_warn, thresholds.success_rate_crit, true);
}

function latencyColor(p95Ms: number, thresholds: DashboardWarningThresholds): string {
  return panelColor(p95Ms, thresholds.latency_p95_warn_ms, thresholds.latency_p95_crit_ms, false);
}

export function renderCompactJson(response: TelemetryApiResponse): string {
  const avgSuccessRate =
    Object.values(response.query_success_rate).reduce((avg, v) => avg + v.rate, 0) /
    Math.max(Object.keys(response.query_success_rate).length, 1);
  return JSON.stringify({
    status: response.tier === DegradationTier.FailClosed ? 'closed' : 'ok',
    tier: response.tier,
    uptime_seconds: response.uptime_seconds,
    version: MIDDLEWARE_VERSION,
    success_rate: avgSuccessRate,
    latency_p50_ms: response.latency_percentiles.global.p50_ms,
    latency_p95_ms: response.latency_percentiles.global.p95_ms,
    probe_success_rate: response.memtrace_uptime.probe_success_rate,
    total_overrides: response.override_frequency.total_overrides,
    active_intents: response.active_intents,
  });
}

function resolveThresholds(): DashboardWarningThresholds {
  const defaults: DashboardWarningThresholds = {
    success_rate_warn: 0.95,
    success_rate_crit: 0.8,
    latency_p95_warn_ms: 600,
    latency_p95_crit_ms: 900,
    uptime_warn_pct: 90,
    uptime_crit_pct: 70,
    confidence_median_warn: 0.9,
    confidence_median_crit: 0.7,
  };
  try {
    const cfg = getCurrentConfig();
    if (cfg.dashboard_warning_thresholds) {
      return { ...defaults, ...cfg.dashboard_warning_thresholds };
    }
  } catch {
    // use defaults
  }
  return defaults;
}

function setupConfigWatcher(
  options: DashboardOptions,
  thresholds: DashboardWarningThresholds,
  refreshBaseline: () => void
): (() => void) | null {
  if (!options.watch) return null;

  const configEmitter = new EventEmitter();
  let watcherCleanup: (() => void) | null = null;

  try {
    const configPath = getConfigPath();
    const watcher = watchConfig(configPath, configEmitter);
    watcherCleanup = () => watcher.close();
  } catch {
    // watch unavailable
  }

  configEmitter.on('config:changed', () => {
    try {
      const cfg = getCurrentConfig();
      if (cfg.dashboard_warning_thresholds) {
        Object.assign(thresholds, cfg.dashboard_warning_thresholds);
      }
      refreshBaseline();
    } catch {
      // keep previous thresholds
    }
  });

  return watcherCleanup;
}

function setupTerminal(onQuit: () => void): {
  stdinCleanup: (() => void) | null;
  resizeCleanup: (() => void) | null;
} {
  let stdinCleanup: (() => void) | null = null;
  let resizeCleanup: (() => void) | null = null;

  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const handler = (key: Buffer) => {
        if (key.toString() === 'q') onQuit();
      };
      process.stdin.on('data', handler);
      stdinCleanup = () => {
        process.stdin.off('data', handler);
        try {
          process.stdin.setRawMode(false);
        } catch {
          /* best-effort */
        }
        process.stdin.pause();
      };
    } catch {
      // stdin setup failed
    }
  } else {
    process.stdout.write(`${ANSI_DIM}[non-interactive mode — press Ctrl+C to exit]${ANSI_RESET}\n`);
  }

  const resizeHandler = () => {
    /* re-render on next tick */
  };
  process.stdout.on('resize', resizeHandler);
  resizeCleanup = () => process.stdout.off('resize', resizeHandler);

  return { stdinCleanup, resizeCleanup };
}

function setupSignalHandlers(onQuit: () => void): (() => void) | null {
  if (process.listenerCount('SIGINT') > 0 || process.listenerCount('SIGTERM') > 0) {
    return null;
  }
  const sigint = () => {
    onQuit();
    process.exit(0);
  };
  const sigterm = () => {
    onQuit();
    process.exit(0);
  };
  process.on('SIGINT', sigint);
  process.on('SIGTERM', sigterm);
  return () => {
    process.off('SIGINT', sigint);
    process.off('SIGTERM', sigterm);
  };
}

export function startDashboard(options: DashboardOptions = {}): DashboardController {
  const isTTY = process.stdout.isTTY ?? false;

  if (!isTTY) {
    const response = loadTelemetrySnapshot() ?? buildTelemetryResponse();
    process.stdout.write(renderCompactJson(response) + '\n');
    return { stop() {} };
  }

  const thresholds = resolveThresholds();
  let baseline = loadBaseline();
  let currentTier: DegradationTier = DegradationTier.Full;
  let flashCounter = 0;
  let flashIsUpgrade = true;
  let stopped = false;
  let previousLineCount = 0;

  const refreshBaseline = () => {
    baseline = loadBaseline();
  };
  const configWatchCleanup = setupConfigWatcher(options, thresholds, refreshBaseline);

  const { stdinCleanup, resizeCleanup } = setupTerminal(() => {
    if (!stopped) stop();
  });

  function renderWith(response: TelemetryApiResponse): void {
    const uptimeSeconds = Math.floor(process.uptime());
    const lines = renderDashboard(
      response,
      thresholds,
      flashCounter,
      baseline,
      uptimeSeconds,
      flashIsUpgrade
    );
    if (previousLineCount > 0) {
      process.stdout.write(`\x1b[${previousLineCount}A`);
    }
    process.stdout.write(lines.join('\n') + '\n');
    process.stdout.write('\x1b[J');
    previousLineCount = lines.length;
  }

  function tick(): void {
    if (stopped) return;
    const response = loadTelemetrySnapshot() ?? buildTelemetryResponse();
    if (response.tier !== currentTier) {
      const tierOrder = [
        DegradationTier.FailClosed,
        DegradationTier.Passthrough,
        DegradationTier.IntentReduced,
        DegradationTier.Full,
      ];
      const oldIdx = tierOrder.indexOf(currentTier);
      const newIdx = tierOrder.indexOf(response.tier);
      flashIsUpgrade = newIdx > oldIdx;
      currentTier = response.tier;
      flashCounter = FLASH_DURATION;
    }
    renderWith(response);
    if (flashCounter > 0) flashCounter--;
  }

  const interval = setInterval(tick, STATUS_REFRESH_MS);
  const signalCleanup = setupSignalHandlers(() => {
    if (!stopped) stop();
  });

  tick(); // initial render

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    stdinCleanup?.();
    resizeCleanup?.();
    signalCleanup?.();
    configWatchCleanup?.();
    process.stdout.write('\n');
  }

  return { stop };
}
