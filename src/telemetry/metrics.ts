import { DegradationTier } from '../types.js';
import type { StatusSnapshot } from '../types.js';
import { getColdStartStats } from './cold-start.js';
import { RingBuffer } from './ring-buffer.js';

const CONFIDENCE_CAPACITY = 100;

let tier: DegradationTier = DegradationTier.Full;
const intentSet = new Set<string>();
let successCount = 0;
let failureCount = 0;
const confidenceBuffer = new RingBuffer<number>(CONFIDENCE_CAPACITY);
let lastResult: 'success' | 'failure' | null = null;

function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.floor(sorted.length * p);
  const clamped = Math.min(idx, sorted.length - 1);
  return sorted[clamped]!;
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

export const metrics = {
  recordDispatch(
    success: boolean,
    intentType: string,
    confidence: number,
    _elapsedMs: number,
    _startupType?: 'cold' | 'warm'
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
  },
};
