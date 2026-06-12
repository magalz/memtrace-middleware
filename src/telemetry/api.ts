import { degradationMachine } from '../degrade/machine.js';
import type { TelemetryApiResponse } from '../types.js';
import { metrics } from './metrics.js';

function computeTelemetryPercentiles(values: number[]): { p50_ms: number; p95_ms: number; p99_ms: number } {
  if (values.length === 0) {
    return { p50_ms: 0, p95_ms: 0, p99_ms: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return { p50_ms: p50, p95_ms: p95, p99_ms: p99 };
}

export function buildTelemetryResponse(): TelemetryApiResponse {
  const snapshot = metrics.getSnapshot();
  const latencySnapshot = metrics.getLatencySnapshot();
  const totalDispatches = snapshot.query_success + snapshot.query_failure;
  const cold = totalDispatches === 0;

  const successCounts = metrics.getIntentSuccessCounts();
  const failureCounts = metrics.getIntentFailureCounts();
  const querySuccessRate: TelemetryApiResponse['query_success_rate'] = {};
  for (const intentType of snapshot.active_intents) {
    const success = successCounts.get(intentType) ?? 0;
    const failure = failureCounts.get(intentType) ?? 0;
    const total = success + failure;
    querySuccessRate[intentType] = {
      success,
      failure,
      total,
      rate: total > 0 ? success / total : 0,
    };
  }

  const latencyPerIntent: TelemetryApiResponse['latency_percentiles']['per_intent'] = {};
  const globalSamples: number[] = [];
  for (const [intentType, stats] of Object.entries(latencySnapshot.per_intent)) {
    latencyPerIntent[intentType] = { p50_ms: stats.p50, p95_ms: stats.p95, p99_ms: stats.p99 };
    if (stats.p50 > 0) globalSamples.push(stats.p50);
    if (stats.p95 > 0) globalSamples.push(stats.p95);
    if (stats.p99 > 0) globalSamples.push(stats.p99);
  }
  const globalLatency = computeTelemetryPercentiles(globalSamples);

  const probeSnapshot = metrics.getProbeBufferSnapshot();
  const confidenceMap = metrics.getConfidenceBufferMap();
  const confidenceDistribution: TelemetryApiResponse['confidence_distribution'] = {};
  for (const [intentType, buffer] of confidenceMap) {
    const values = buffer.toArray();
    if (values.length === 0) {
      confidenceDistribution[intentType] = { p50: 0, p95: 0, sample_count: 0 };
    } else {
      const sorted = [...values].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
      const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
      confidenceDistribution[intentType] = { p50, p95, sample_count: values.length };
    }
  }

  const overrideFrequency: TelemetryApiResponse['override_frequency'] = {
    total_overrides: metrics.getForceTierOverrideCount(),
  };

  return {
    schema_version: '1.0',
    cold_start: cold,
    timestamp: new Date().toISOString(),
    query_success_rate: querySuccessRate,
    override_frequency: overrideFrequency,
    latency_percentiles: {
      global: globalLatency,
      per_intent: latencyPerIntent,
    },
    memtrace_uptime: {
      probe_success_rate: probeSnapshot.total_probes > 0
        ? Math.round((probeSnapshot.successful_probes / probeSnapshot.total_probes) * 100 * 10) / 10
        : 0,
      total_probes: probeSnapshot.total_probes,
      successful_probes: probeSnapshot.successful_probes,
    },
    confidence_distribution: confidenceDistribution,
    p50_history: metrics.getP50History(),
    buffer_utilization_pct: metrics.getBufferUtilizationPct(),
    uptime_seconds: Math.floor(process.uptime()),
    tier: degradationMachine.getCurrentTier(),
    active_intents: snapshot.active_intents,
    pruning: metrics.getPruningStats(),
  };
}
