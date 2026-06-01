import { COLD_START_DISPATCH_COUNT, COLD_START_IDLE_THRESHOLD_MS } from '../constants.js';

let coldStartDispatchCount = 0;
const coldStartTimings: number[] = [];
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function startIdleTimer(): void {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    coldStartDispatchCount = 0;
    coldStartTimings.length = 0;
    idleTimer = null;
  }, COLD_START_IDLE_THRESHOLD_MS);
}

export function isColdStart(): boolean {
  return coldStartDispatchCount < COLD_START_DISPATCH_COUNT;
}

export function coldStartRecordDispatch(elapsedMs: number): void {
  if (isColdStart() && Number.isFinite(elapsedMs) && elapsedMs >= 0) {
    coldStartTimings.push(elapsedMs);
  }
  coldStartDispatchCount++;
  startIdleTimer();
}

export function resetColdStartDetector(): void {
  clearIdleTimer();
  coldStartDispatchCount = 0;
  coldStartTimings.length = 0;
}

export function getColdStartStats(): { count: number; p50_ms: number } {
  if (coldStartTimings.length === 0) {
    return { count: 0, p50_ms: 0 };
  }
  const sorted = [...coldStartTimings].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const p50 = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return { count: coldStartTimings.length, p50_ms: p50 };
}
