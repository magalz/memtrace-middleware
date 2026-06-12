import { DegradationTier } from '../types.js';
import type { LatencySnapshot, LatencyStats, StatusSnapshot } from '../types.js';
import { getColdStartStats } from './cold-start.js';
import { RingBuffer } from './ring-buffer.js';
import { getRateLimiter, getCircuitBreaker } from '../degrade/index.js';

const CONFIDENCE_CAPACITY = 100;
const LATENCY_BUFFER_CAPACITY = 500;

let tier: DegradationTier = DegradationTier.Full;
const intentSet = new Set<string>();
let successCount = 0;
let failureCount = 0;
const confidenceBuffer = new RingBuffer<number>(CONFIDENCE_CAPACITY);
let lastResult: 'success' | 'failure' | null = null;

const latencyBuffers = new Map<string, RingBuffer<number>>();
const coldStartLatencyBuffer = new RingBuffer<number>(LATENCY_BUFFER_CAPACITY);
const steadyStateLatencyBuffer = new RingBuffer<number>(LATENCY_BUFFER_CAPACITY);

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

const MAX_INTENT_BUFFERS = 50;

function getLatencyBuffer(intentType: string): RingBuffer<number> {
  let buffer = latencyBuffers.get(intentType);
  if (!buffer) {
    if (latencyBuffers.size >= MAX_INTENT_BUFFERS) {
      return new RingBuffer<number>(0); // dummy — silently discard
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
    } else {
      failureCount++;
    }
    lastResult = success ? 'success' : 'failure';
    intentSet.add(intentType);
    if (Number.isFinite(confidence)) {
      confidenceBuffer.push(confidence);
    }
    recordLatencyImpl(intentType, elapsedMs, startupType === 'cold');
  },

  recordLatency: recordLatencyImpl,

  getLatencySnapshot: getLatencySnapshotImpl,

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
    };
  },

  updateTier(newTier: DegradationTier): void {
    tier = newTier;
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
  },
};
