import { degradationMachine, DegradationMachine } from './machine.js';
import { ProbeTimer } from './probe-timer.js';
import type { MemtraceBackend } from '../backend/trait.js';
import { normalizeFloor, type DegradationFloor, type MiddlewareConfig } from '../config/types.js';
import { createLogger } from '../logger.js';

export { DegradationMachine, degradationMachine };
export { ProbeTimer };

const log = createLogger('degrade');

let probeTimer: ProbeTimer | null = null;

export function getFloorOverride(): string | undefined {
  return degradationMachine.getFloorTier();
}

export function onConfigChanged(delta: Partial<MiddlewareConfig>): void {
  if ('degradation_floor' in delta && delta.degradation_floor !== undefined) {
    const floorTier = normalizeFloor(delta.degradation_floor as DegradationFloor);
    degradationMachine.setFloorTier(floorTier);
    log.info('floor_updated', { floor: delta.degradation_floor });
  }

  if (
    'timeout_budgets' in delta &&
    delta.timeout_budgets?.probe_interval_ms !== undefined &&
    probeTimer
  ) {
    try {
      probeTimer.restart(delta.timeout_budgets.probe_interval_ms);
      log.info('probe_interval_updated', { interval_ms: delta.timeout_budgets.probe_interval_ms });
    } catch (err: unknown) {
      log.error('probe_restart_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function initializeDegradation(backend: MemtraceBackend, config: MiddlewareConfig): void {
  probeTimer = new ProbeTimer(backend, degradationMachine);

  const intervalMs = config.timeout_budgets.probe_interval_ms;
  degradationMachine.setFloorTier(normalizeFloor(config.degradation_floor));
  probeTimer.start(intervalMs);

  log.info('degradation_initialized', {
    floor: config.degradation_floor,
    probe_interval_ms: intervalMs,
  });
}

export function shutdownDegradation(): void {
  if (probeTimer) {
    probeTimer.stop();
    probeTimer = null;
  }
  log.info('degradation_shutdown');
}
