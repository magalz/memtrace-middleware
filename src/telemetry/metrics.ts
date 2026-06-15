import { DegradationTier } from '../types.js';
import type { LatencySnapshot, LatencyStats, PruningStats, StatusSnapshot } from '../types.js';
import { getColdStartStats, resetColdStartDetector } from './cold-start.js';
import { RingBuffer } from './ring-buffer.js';
import { TELEMETRY_PROBE_RING_SIZE } from '../constants.js';
import { getRateLimiter, getCircuitBreaker } from '../degrade/index.js';

const CONFIDENCE_CAPACITY = 100;
const LATENCY_BUFFER_CAPACITY = 500;
const P50_HISTORY_CAPACITY = 60;

let tier: DegradationTier = DegradationTier.Full;
const intentSet = new Set<string>();
let successCount = 0;
let failureCount = 0;
const confidenceBuffer = new RingBuffer<number>(CONFIDENCE_CAPACITY);
let lastResult: 'success' | 'failure' | null = null;

const intentSuccessCounts = new Map<string, number>();
const intentFailureCounts = new Map<string, number>();
let forceTierOverrideCount = 0;
const probeBuffer = new RingBuffer<boolean>(TELEMETRY_PROBE_RING_SIZE);
const confidenceBufferMap = new Map<string, RingBuffer<number>>();

const latencyBuffers = new Map<string, RingBuffer<number>>();
const coldStartLatencyBuffer = new RingBuffer<number>(LATENCY_BUFFER_CAPACITY);
const steadyStateLatencyBuffer = new RingBuffer<number>(LATENCY_BUFFER_CAPACITY);
const p50HistoryBuffer = new RingBuffer<number>(P50_HISTORY_CAPACITY);

let pruningStats: PruningStats | null = null;
let totalTokensSaved = 0;

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.floor(sorted.length * p);
  const clamped = Math.min(idx, sorted.length - 1);
  return sorted[clamped]!;
}

function computeLatencyStats(buffer: RingBuffer<number>): LatencyStats {
  const values = buffer.toArray();
  if (values.length === 0) {
    return { p50: 0, p95: 0, p99: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: computePercentile(sorted, 0.5),
    p95: computePercentile(sorted, 0.95),
    p99: computePercentile(sorted, 0.99),
    count: values.length,
  };
}

function computeP50(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return computePercentile(sorted, 0.5);
}

const MAX_INTENT_BUFFERS = 50;

function getLatencyBuffer(intentType: string): RingBuffer<number> {
  let buffer = latencyBuffers.get(intentType);
  if (!buffer) {
    if (latencyBuffers.size >= MAX_INTENT_BUFFERS) {
      return steadyStateLatencyBuffer; // overflow — merge into steady-state pool
    }
    buffer = new RingBuffer<number>(LATENCY_BUFFER_CAPACITY);
    latencyBuffers.set(intentType, buffer);
  }
  return buffer;
}

function getConfidencePercentiles(): { p50: number; p95: number } {
  const values = confidenceBuffer.toArray();
  if (values.length === 0) {
    return { p50: 0, p95: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: computePercentile(sorted, 0.5),
    p95: computePercentile(sorted, 0.95),
  };
}

function recordLatencyImpl(intentType: string, elapsedMs: number, coldStart: boolean): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return;
  }
  const buffer = getLatencyBuffer(intentType);
  buffer.push(elapsedMs);
  if (coldStart) {
    coldStartLatencyBuffer.push(elapsedMs);
  } else {
    steadyStateLatencyBuffer.push(elapsedMs);
  }
}

function getLatencySnapshotImpl(): LatencySnapshot {
  const perIntent: Record<string, LatencyStats> = {};
  for (const [intentType, buffer] of latencyBuffers) {
    perIntent[intentType] = computeLatencyStats(buffer);
  }
  return {
    per_intent: perIntent,
    cold_start: computeLatencyStats(coldStartLatencyBuffer),
    steady_state: computeLatencyStats(steadyStateLatencyBuffer),
  };
}

function getConfidenceBuffer(intentType: string): RingBuffer<number> {
  let buffer = confidenceBufferMap.get(intentType);
  if (buffer) {
    return buffer;
  }
  if (confidenceBufferMap.size >= MAX_INTENT_BUFFERS) {
    return confidenceBuffer;
  }
  buffer = new RingBuffer<number>(CONFIDENCE_CAPACITY);
  confidenceBufferMap.set(intentType, buffer);
  return buffer;
}

export const metrics = {
  recordDispatch(
    success: boolean,
    intentType: string,
    confidence: number,
    elapsedMs: number,
    startupType?: 'cold' | 'warm'
  ): void {
    if (success) {
      successCount++;
      intentSuccessCounts.set(intentType, (intentSuccessCounts.get(intentType) ?? 0) + 1);
    } else {
      failureCount++;
      intentFailureCounts.set(intentType, (intentFailureCounts.get(intentType) ?? 0) + 1);
    }
    lastResult = success ? 'success' : 'failure';
    intentSet.add(intentType);
    if (Number.isFinite(confidence)) {
      confidenceBuffer.push(confidence);
      getConfidenceBuffer(intentType).push(confidence);
    }
    recordLatencyImpl(intentType, elapsedMs, startupType === 'cold');
    const steadyValues = steadyStateLatencyBuffer.toArray();
    const combined = [...coldStartLatencyBuffer.toArray(), ...steadyValues];
    p50HistoryBuffer.push(computeP50(combined));
  },

  recordLatency: recordLatencyImpl,

  getLatencySnapshot: getLatencySnapshotImpl,

  recordForceTierOverride(_tier: DegradationTier): void {
    forceTierOverrideCount++;
  },

  recordProbe(success: boolean): void {
    probeBuffer.push(success);
  },

  getForceTierOverrideCount(): number {
    return forceTierOverrideCount;
  },

  getP50History(): number[] {
    return p50HistoryBuffer.toArray();
  },

  getIntentSuccessCounts(): Map<string, number> {
    return new Map(intentSuccessCounts);
  },

  getIntentFailureCounts(): Map<string, number> {
    return new Map(intentFailureCounts);
  },

  getProbeSuccessRate(): number {
    const values = probeBuffer.toArray();
    if (values.length === 0) {
      return 0;
    }
    const successes = values.filter(Boolean).length;
    return (successes / values.length) * 100;
  },

  getProbeBufferSnapshot(): { total_probes: number; successful_probes: number } {
    const values = probeBuffer.toArray();
    const successes = values.filter(Boolean).length;
    return { total_probes: values.length, successful_probes: successes };
  },

  getConfidenceBufferMap(): Map<string, RingBuffer<number>> {
    return new Map(confidenceBufferMap);
  },

  getBufferUtilizationPct(): number {
    const all: number[] = [];
    all.push(confidenceBuffer.getCount() / confidenceBuffer.getCapacity());
    for (const buf of confidenceBufferMap.values()) {
      all.push(buf.getCount() / buf.getCapacity());
    }
    for (const buf of latencyBuffers.values()) {
      all.push(buf.getCount() / buf.getCapacity());
    }
    all.push(coldStartLatencyBuffer.getCount() / coldStartLatencyBuffer.getCapacity());
    all.push(steadyStateLatencyBuffer.getCount() / steadyStateLatencyBuffer.getCapacity());
    all.push(probeBuffer.getCount() / probeBuffer.getCapacity());
    const finite = all.filter((v) => Number.isFinite(v));
    if (finite.length === 0) {
      return 0;
    }
    const maxUtil = Math.max(...finite);
    return Math.round(maxUtil * 100 * 10) / 10;
  },

  getSnapshot(): StatusSnapshot {
    const percentiles = getConfidencePercentiles();
    return {
      tier,
      uptime_seconds: Math.floor(process.uptime()),
      active_intents: Array.from(intentSet).sort(),
      query_success: successCount,
      query_failure: failureCount,
      confidence_p50: percentiles.p50,
      confidence_p95: percentiles.p95,
      last_dispatch_result: lastResult,
      cold_start: getColdStartStats(),
      latency_stats: getLatencySnapshotImpl(),
      rate_limit: getRateLimiter()?.getRateLimitSnapshot(),
      circuit: getCircuitBreaker()?.getCircuitSnapshot(),
      pruning: pruningStats,
    };
  },

  updateTier(newTier: DegradationTier): void {
    tier = newTier;
  },

  recordPruning(stats: PruningStats): void {
    pruningStats = stats;
    totalTokensSaved += stats.tokens_saved_estimate;
  },

  getPruningStats(): PruningStats | null {
    return pruningStats;
  },

  getTotalTokensSaved(): number {
    return totalTokensSaved;
  },

  reset(): void {
    tier = DegradationTier.Full;
    intentSet.clear();
    successCount = 0;
    failureCount = 0;
    confidenceBuffer.clear();
    lastResult = null;
    latencyBuffers.clear();
    coldStartLatencyBuffer.clear();
    steadyStateLatencyBuffer.clear();
    intentSuccessCounts.clear();
    intentFailureCounts.clear();
    forceTierOverrideCount = 0;
    probeBuffer.clear();
    confidenceBufferMap.clear();
    p50HistoryBuffer.clear();
    pruningStats = null;
    totalTokensSaved = 0;
    resetColdStartDetector();
  },
};
