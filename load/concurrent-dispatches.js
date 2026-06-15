// k6 latency validation for middleware dispatch pipeline
// Validates AC1: p95 < 900ms, p50 < 300ms at 60 concurrent dispatches
// Run: k6 run load/concurrent-dispatches.js
import { check } from 'k6';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';

const dispatchDuration = new Trend('dispatch_duration');
const dispatchSuccess = new Counter('dispatch_success');
const dispatchFailure = new Counter('dispatch_failure');

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

export const options = {
  scenarios: {
    cold_start: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '1s',
      duration: '1s',
      preAllocatedVUs: 1,
      maxVUs: 1,
      startTime: '0s',
      tags: { startup: 'cold' },
    },
    warmup: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '25s',
      preAllocatedVUs: 10,
      maxVUs: 20,
      startTime: '5s',
      tags: { startup: 'warmup' },
    },
    steady_state: {
      executor: 'constant-arrival-rate',
      rate: 60,
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 30,
      maxVUs: 60,
      startTime: '30s',
      tags: { startup: 'warm' },
    },
  },
  thresholds: {
    dispatch_duration: ['p(50)<300', 'p(95)<900', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const intent = INTENTS[Math.floor(Math.random() * INTENTS.length)];
  const payload = JSON.stringify({
    tool_call: intent.tool,
    args: intent.args,
    startup: __ENV.SCENARIO_STARTUP || 'warm',
  });
  const res = http.post(`${BASE_URL}/dispatch`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  dispatchDuration.add(res.timings.duration);
  if (res.status === 200) {
    dispatchSuccess.add(1, { intent: intent.name });
  } else {
    dispatchFailure.add(1, { intent: intent.name });
  }

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has trace_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return !!body.trace_id;
      } catch {
        return false;
      }
    },
    'blocks is non-empty array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.blocks) && body.blocks.length > 0;
      } catch {
        return false;
      }
    },
    'partial is boolean': (r) => {
      try {
        const body = JSON.parse(r.body);
        return typeof body.partial === 'boolean';
      } catch {
        return false;
      }
    },
  });
}

export function handleSummary(data) {
  const coldResults = [];
  const warmResults = [];
  const perIntent = {};

  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.type !== 'trend') continue;
    const trend = metric.values;
    const stats = {
      p50: trend.p(50) ?? 0,
      p95: trend.p(95) ?? 0,
      p99: trend.p(99) ?? 0,
      min: trend.min ?? 0,
      max: trend.max ?? 0,
      avg: trend.avg ?? 0,
      count: trend.count ?? 0,
    };

    if (name === 'dispatch_duration') {
      coldResults.push({ startup: 'cold', ...stats });
      warmResults.push({ startup: 'warm', ...stats });
    }
  }

  const dispatchSucc = data.metrics['dispatch_success'];
  const dispatchFail = data.metrics['dispatch_failure'];
  if (dispatchSucc?.values?.tags) {
    for (const [intentName, count] of Object.entries(dispatchSucc.values.tags)) {
      perIntent[intentName] = perIntent[intentName] || { success: 0, failure: 0 };
      perIntent[intentName].success = (count && count.count) || 0;
    }
  }
  if (dispatchFail?.values?.tags) {
    for (const [intentName, count] of Object.entries(dispatchFail.values.tags)) {
      perIntent[intentName] = perIntent[intentName] || { success: 0, failure: 0 };
      perIntent[intentName].failure = (count && count.count) || 0;
    }
  }

  const summary = {
    test: 'concurrent-dispatches',
    scenario: 'latency-validation',
    thresholds_met: Object.values(data.metrics).every((m) =>
      (m.thresholds ?? []).every((t) => t.ok)
    ),
    cold_start: coldResults,
    steady_state: warmResults,
    per_intent: perIntent,
    http_req_duration: {
      p50: data.metrics['http_req_duration']?.values?.p(50) ?? 0,
      p95: data.metrics['http_req_duration']?.values?.p(95) ?? 0,
      p99: data.metrics['http_req_duration']?.values?.p(99) ?? 0,
    },
    http_req_failed: data.metrics['http_req_failed']?.values?.rate ?? 0,
  };

  return {
    stdout: JSON.stringify(summary, null, 2),
    'load/results/concurrent-dispatches.json': JSON.stringify(summary),
  };
}
