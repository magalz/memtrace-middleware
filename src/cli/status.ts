import { STATUS_REFRESH_MS, MIDDLEWARE_VERSION } from '../constants.js';
import { createLogger } from '../logger.js';
import { metrics } from '../telemetry/index.js';
import { DegradationTier } from '../types.js';
import type { StatusSnapshot } from '../types.js';

const log = createLogger('cli');

const ANSI_RESET = '\x1b[0m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';

const FLASH_DURATION = 3;

function tierDot(tier: DegradationTier): string {
  switch (tier) {
    case DegradationTier.Full:
      return `${ANSI_GREEN}●${ANSI_RESET} full`;
    case DegradationTier.IntentReduced:
    case DegradationTier.Passthrough:
      return `${ANSI_YELLOW}◐${ANSI_RESET} ${tier}`;
    case DegradationTier.FailClosed:
      return `${ANSI_RED}✕${ANSI_RESET} fail_closed`;
  }
}

export interface StatusOptions {
  tier?: DegradationTier;
}

export interface StatusController {
  stop(): void;
  updateTier(tier: DegradationTier): void;
  addIntent(intent: string): void;
}

interface FlashState {
  counter: number;
  type: 'success' | 'failure' | null;
}

export function createFlashTracker(): {
  trigger(result: 'success' | 'failure' | null): void;
  render(line: string): string;
  tick(): void;
  getState(): FlashState;
} {
  let counter = 0;
  let type: 'success' | 'failure' | null = null;

  return {
    trigger(result) {
      if (result !== null) {
        counter = FLASH_DURATION;
        type = result;
      }
    },
    render(line) {
      if (counter > 0 && type) {
        const flashSig =
          type === 'success' ? `${ANSI_GREEN} ✓${ANSI_RESET}` : `${ANSI_RED} ✗${ANSI_RESET}`;
        return line + flashSig;
      }
      return line;
    },
    tick() {
      if (counter > 0) {
        counter--;
      }
    },
    getState() {
      return { counter, type };
    },
  };
}

function circuitDot(state: string | undefined): string {
  switch (state) {
    case 'closed':
      return `${ANSI_GREEN}●${ANSI_RESET}`;
    case 'open':
      return `${ANSI_RED}○${ANSI_RESET}`;
    case 'half_open':
      return `${ANSI_YELLOW}◐${ANSI_RESET}`;
    default:
      return '';
  }
}

function rateLine(rl: StatusSnapshot['rate_limit']): string {
  if (!rl) return '';
  return `${rl.current_count}/${rl.max_requests}req c:${rl.current_concurrent}/${rl.max_concurrent}`;
}

function circuitAge(ts: number | undefined): string {
  if (!ts) return '';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
}

export function renderStatus(snapshot: StatusSnapshot | null, isTTY: boolean): string {
  if (!snapshot) {
    if (isTTY) {
      return '\r\x1b[K\x1b[33mno data\x1b[0m';
    }
    return '';
  }

  if (!isTTY) {
    const data: Record<string, unknown> = {
      status: snapshot.tier === DegradationTier.FailClosed ? 'closed' : 'ok',
      tier: snapshot.tier,
      uptime_seconds: snapshot.uptime_seconds,
      version: MIDDLEWARE_VERSION,
      active_intents: snapshot.active_intents,
      query_success: snapshot.query_success,
      query_failure: snapshot.query_failure,
      confidence_p50: snapshot.confidence_p50,
      confidence_p95: snapshot.confidence_p95,
    };
    if (snapshot.circuit) {
      data.circuit_state = snapshot.circuit.state;
      data.circuit_failure_count = snapshot.circuit.failure_count;
    }
    if (snapshot.rate_limit) {
      data.rate_limit_current = snapshot.rate_limit.current_count;
      data.rate_limit_max = snapshot.rate_limit.max_requests;
    }
    return JSON.stringify(data);
  }

  const parts: string[] = [];
  parts.push(tierDot(snapshot.tier));
  if (snapshot.circuit) {
    parts.push(`cb:${circuitDot(snapshot.circuit.state)}`);
  }
  if (snapshot.rate_limit) {
    parts.push(`rl:${rateLine(snapshot.rate_limit)}`);
  }
  parts.push(snapshot.active_intents.length > 0 ? snapshot.active_intents.join(', ') : 'idle');
  parts.push(`✓${snapshot.query_success} ✗${snapshot.query_failure}`);
  parts.push(`p50:${snapshot.confidence_p50.toFixed(2)} p95:${snapshot.confidence_p95.toFixed(2)}`);
  parts.push(`uptime: ${snapshot.uptime_seconds}s`);
  if (snapshot.circuit?.last_state_change_at) {
    parts.push(`cb:${circuitAge(snapshot.circuit.last_state_change_at)}`);
  }

  return `\r\x1b[K${parts.join(' | ')}`;
}

export function startStatusDisplay(options?: StatusOptions): StatusController {
  if (options?.tier) {
    metrics.updateTier(options.tier);
  }

  const flash = createFlashTracker();

  let previousLastResult: 'success' | 'failure' | null = null;

  function renderLine(snapshot: StatusSnapshot, isTTY: boolean): string {
    let line = renderStatus(snapshot, isTTY);
    if (isTTY) {
      line = flash.render(line);
    }
    return line;
  }

  const interval = setInterval(() => {
    const snapshot = metrics.getSnapshot();
    const isTTY = process.stdout.isTTY ?? false;

    if (
      snapshot.last_dispatch_result !== null &&
      snapshot.last_dispatch_result !== previousLastResult
    ) {
      flash.trigger(snapshot.last_dispatch_result);
    }
    previousLastResult = snapshot.last_dispatch_result;

    const line = renderLine(snapshot, isTTY);
    process.stdout.write(line);
    flash.tick();
  }, STATUS_REFRESH_MS);

  let signalHandlerRegistered = false;
  let sigintHandler: (() => void) | null = null;
  let sigtermHandler: (() => void) | null = null;

  function ensureSignalHandlers(): void {
    if (signalHandlerRegistered) return;
    if (process.listenerCount('SIGINT') > 0 || process.listenerCount('SIGTERM') > 0) {
      return;
    }
    sigintHandler = () => {
      stop();
      process.exit(0);
    };
    sigtermHandler = () => {
      stop();
      process.exit(0);
    };
    process.on('SIGINT', sigintHandler);
    process.on('SIGTERM', sigtermHandler);
    signalHandlerRegistered = true;
  }

  ensureSignalHandlers();

  function stop(): void {
    clearInterval(interval);
    process.stdout.write('\n');
    if (signalHandlerRegistered) {
      if (sigintHandler) process.off('SIGINT', sigintHandler);
      if (sigtermHandler) process.off('SIGTERM', sigtermHandler);
      sigintHandler = null;
      sigtermHandler = null;
      signalHandlerRegistered = false;
    }
  }

  return {
    stop,
    updateTier(tier: DegradationTier): void {
      metrics.updateTier(tier);
      log.debug('tier_updated', { tier });
    },
    addIntent(intent: string): void {
      log.debug('intent_added', { intent });
    },
  };
}
