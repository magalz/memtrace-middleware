// k6 degradation and recovery simulation for middleware
// Validates AC2, AC3, AC4 — triggers happen DURING scenarios (not after)
// Run: k6 run load/degradation-scenarios.js
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';

const dispatchDuration = new Trend('dispatch_duration');
const dispatchSuccess = new Counter('dispatch_success');
const dispatchFailure = new Counter('dispatch_failure');
const degradationRecoveryTime = new Trend('degradation_recovery_time');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// 3 probe windows = PROBE_INTERVAL_MS (15s) * HYSTERESIS_PROBE_COUNT (3) = 45s
const PROBE_INTERVAL_MS = 15000;
const HYSTERESIS_PROBE_COUNT = 3;
const FLAP_WINDOW_MS = PROBE_INTERVAL_MS * HYSTERESIS_PROBE_COUNT;

const INTENTS = [
  { name: 'find_code', tool: 'memtrace_find_code', args: { query: 'auth', file_path: 'src/' } },
  {
    name: 'get_symbol_context',
    tool: 'memtrace_get_symbol_context',
    args: { symbol: 'validateToken', repo_id: 'my-repo' },
  },
  {
    name: 'get_impact',
    tool: 'memtrace_get_impact',
    args: { target: 'validateToken', repo_id: 'my-repo' },
  },
  { name: 'review_code', tool: 'find_ast_review_issues', args: { diff: '', repo_root: '.' } },
  { name: 'get_style_fingerprint', tool: 'get_style_fingerprint', args: { repo_id: 'my-repo' } },
  { name: 'find_dead_code', tool: 'memtrace_find_dead_code', args: { repo_id: 'my-repo' } },
  {
    name: 'get_evolution',
    tool: 'memtrace_get_evolution',
    args: { repo_id: 'my-repo', from: '7d ago' },
  },
  {
    name: 'get_process_flow',
    tool: 'memtrace_get_process_flow',
    args: { process: 'login', repo_id: 'my-repo' },
  },
  { name: 'get_api_topology', tool: 'memtrace_get_api_topology', args: {} },
  {
    name: 'find_bridge_symbols',
    tool: 'memtrace_find_bridge_symbols',
    args: { repo_id: 'my-repo' },
  },
  {
    name: 'find_central_symbols',
    tool: 'memtrace_find_central_symbols',
    args: { repo_id: 'my-repo' },
  },
  {
    name: 'find_dependency_path',
    tool: 'memtrace_find_dependency_path',
    args: { source: 'login', target: 'db', repo_id: 'my-repo' },
  },
];

function getRandomIntent() {
  return INTENTS[Math.floor(Math.random() * INTENTS.length)];
}

function dispatch(intent) {
  const payload = JSON.stringify({ tool_call: intent.tool, args: intent.args });
  const res = http.post(`${BASE_URL}/dispatch`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  dispatchDuration.add(res.timings.duration);
  if (res.status === 200) {
    dispatchSuccess.add(1);
  } else {
    dispatchFailure.add(1);
  }
  return res;
}

function getStatus() {
  const res = http.get(`${BASE_URL}/status`);
  if (res.status === 200) {
    try {
      return JSON.parse(res.body);
    } catch {
      return null;
    }
  }
  return null;
}

function waitForTier(targetTier, timeoutSeconds, pollIntervalSeconds) {
  const deadline = Date.now() + timeoutSeconds * 1000;
  while (Date.now() < deadline) {
    const status = getStatus();
    if (status && status.tier === targetTier) {
      return { success: true, elapsed_ms: timeoutSeconds * 1000 - (deadline - Date.now()) };
    }
    sleep(pollIntervalSeconds);
  }
  const finalStatus = getStatus();
  return { success: false, finalTier: finalStatus?.tier };
}

function buildFlappingReport(tierHistory) {
  const transitions = [];
  for (const entry of tierHistory) {
    transitions.push({
      from: entry.from,
      to: entry.to,
      reason: entry.reason,
      timestamp: entry.timestamp,
    });
  }
  let flappingDetected = false;
  for (let i = 1; i < transitions.length; i++) {
    const prev = new Date(transitions[i - 1].timestamp).getTime();
    const curr = new Date(transitions[i].timestamp).getTime();
    if (Number.isNaN(prev) || Number.isNaN(curr)) continue;
    if (curr - prev < FLAP_WINDOW_MS) {
      flappingDetected = true;
      break;
    }
  }
  return { transitions, flappingDetected };
}

export const options = {
  scenarios: {
    phase1_normal: {
      exec: 'phase1',
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 30,
      maxVUs: 60,
      startTime: '0s',
      tags: { phase: 'normal' },
    },
    phase2_trigger: {
      exec: 'triggerDown',
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      startTime: '30s',
    },
    phase3_degraded: {
      exec: 'phase3',
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 30,
      maxVUs: 60,
      startTime: '31s',
      tags: { phase: 'degraded' },
    },
    phase4_trigger: {
      exec: 'triggerUp',
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      startTime: '61s',
    },
    phase5_recovered: {
      exec: 'phase5',
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 30,
      maxVUs: 60,
      startTime: '62s',
      tags: { phase: 'recovered' },
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.10'],
    checks: ['rate>0.90'],
  },
};

export function setup() {
  const initial = getStatus();
  return { initial_tier: initial?.tier ?? 'unknown' };
}

export function phase1() {
  const intent = getRandomIntent();
  dispatch(intent);
}

export function triggerDown() {
  const res = http.post(`${BASE_URL}/simulate/memtrace-down`, '{}', {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'memtrace-down simulated': (r) => r.status === 200 });

  const degradedResult = waitForTier('passthrough', 60, 0.5);
  check(degradedResult.success, { 'degraded to passthrough': (v) => v === true });
}

export function phase3() {
  const intent = getRandomIntent();
  const res = dispatch(intent);
  check(res, {
    'degraded phase — status is 2xx (no crash)': (r) => r.status >= 200 && r.status < 300,
  });
}

export function triggerUp() {
  const res = http.post(`${BASE_URL}/simulate/memtrace-up`, '{}', {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'memtrace-up simulated': (r) => r.status === 200 });

  const recoveryStart = Date.now();
  const recoveredResult = waitForTier('full', 60, 0.5);
  const recoveryMs = Date.now() - recoveryStart;
  degradationRecoveryTime.add(recoveryMs);

  check(recoveredResult.success, { 'recovered to full': (v) => v === true });
  check(recoveryMs < FLAP_WINDOW_MS, { 'recovery within configured window': (v) => v === true });
}

export function phase5() {
  const intent = getRandomIntent();
  const res = dispatch(intent);
  check(res, {
    'post-recovery — status is 200': (r) => r.status === 200,
  });
}

export function teardown() {
  const finalStatus = getStatus();
  const tierHistory = finalStatus?.tier_history ?? [];
  const flappingReport = buildFlappingReport(tierHistory);

  const summary = {
    test: 'degradation-scenarios',
    scenario: 'degradation-recovery-simulation',
    initial_tier: finalStatus?.tier ?? 'unknown',
    final_tier: finalStatus?.tier ?? 'unknown',
    flapping_prevention: {
      passed: !flappingReport.flappingDetected,
      transitions_recorded: flappingReport.transitions.length,
      transitions: flappingReport.transitions,
    },
  };

  // Output summary for k6 stdout capture
  try {
    console.log(JSON.stringify(summary));
  } catch {
    // console might not be available
  }
}

export function handleSummary(data) {
  const p50 = data.metrics['dispatch_duration']?.values?.p(50) ?? 0;
  const p95 = data.metrics['dispatch_duration']?.values?.p(95) ?? 0;
  const p99 = data.metrics['dispatch_duration']?.values?.p(99) ?? 0;
  const successCount = data.metrics['dispatch_success']?.values?.count ?? 0;
  const failureCount = data.metrics['dispatch_failure']?.values?.count ?? 0;

  return {
    'load/results/degradation-scenarios.json': JSON.stringify(
      {
        test: 'degradation-scenarios',
        scenario: 'degradation-recovery-simulation',
        p50,
        p95,
        p99,
        query_success: successCount,
        query_failure: failureCount,
        http_req_duration: {
          p50: data.metrics['http_req_duration']?.values?.p(50) ?? 0,
          p95: data.metrics['http_req_duration']?.values?.p(95) ?? 0,
          p99: data.metrics['http_req_duration']?.values?.p(99) ?? 0,
        },
        http_req_failed: data.metrics['http_req_failed']?.values?.rate ?? 0,
        degradation_recovery_time_ms: data.metrics['degradation_recovery_time']?.values?.avg ?? 0,
      },
      null,
      2
    ),
  };
}
