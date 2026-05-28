import {
  MAX_SUB_QUERY_TIMEOUT_MS,
  MAX_DISPATCH_TIMEOUT_MS,
  PROBE_INTERVAL_MS,
} from '../constants.js';

let currentSubQueryTimeout = MAX_SUB_QUERY_TIMEOUT_MS;
let currentDispatchTimeout = MAX_DISPATCH_TIMEOUT_MS;
let currentProbeInterval = PROBE_INTERVAL_MS;

export function getTimeouts() {
  return {
    subQueryMs: currentSubQueryTimeout,
    dispatchMs: currentDispatchTimeout,
    probeIntervalMs: currentProbeInterval,
  };
}

export function onConfigChanged(delta: Record<string, unknown>): void {
  const tb = delta['timeout_budgets'] as Record<string, number> | undefined;
  if (tb) {
    if (tb.sub_query_ms !== undefined) currentSubQueryTimeout = tb.sub_query_ms;
    if (tb.dispatch_ms !== undefined) currentDispatchTimeout = tb.dispatch_ms;
    if (tb.probe_interval_ms !== undefined) currentProbeInterval = tb.probe_interval_ms;
  }
}
