import { degradationMachine, DegradationMachine } from './machine.js';
import { ProbeTimer } from './probe-timer.js';
import type { MemtraceBackend } from '../backend/trait.js';
import { normalizeFloor, type DegradationFloor, type MiddlewareConfig } from '../config/types.js';
import { createLogger } from '../logger.js';
import { DegradationTier } from '../types.js';

export { DegradationMachine, degradationMachine };
export { ProbeTimer };

const log = createLogger('degrade');

let probeTimer: ProbeTimer | null = null;
let lastProbeIntervalMs: number | null = null;

export function setForceTier(tier: DegradationTier): void {
  if (probeTimer) {
    probeTimer.stop();
  }
  degradationMachine.setForceTier(tier);
  log.info('force_tier_activated', { tier, probe_timer_stopped: true });
}

export function clearForceTier(): void {
  const wasForced = degradationMachine.isForceActive();
  degradationMachine.clearForceTier();
  if (wasForced && probeTimer && lastProbeIntervalMs !== null) {
    try {
      probeTimer.restart(lastProbeIntervalMs);
      log.info('probe_timer_restarted_after_force_clear', { interval_ms: lastProbeIntervalMs });
    } catch (err: unknown) {
      log.error('probe_restart_after_force_clear_failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function isForceActive(): boolean {
  return degradationMachine.isForceActive();
}

export function getFloorOverride(): string | undefined {
  return degradationMachine.getFloorTier();
}

export function onConfigChanged(delta: Partial<MiddlewareConfig>): void {
  if ('degradation_floor' in delta && delta.degradation_floor !== undefined) {
    const floorTier = normalizeFloor(delta.degradation_floor as DegradationFloor);
    degradationMachine.setFloorTier(floorTier);
    log.info('floor_updated', { floor: delta.degradation_floor });
  }

  if ('hysteresis_probe_count' in delta && delta.hysteresis_probe_count !== undefined) {
    const accepted = degradationMachine.setHysteresisCount(delta.hysteresis_probe_count);
    if (accepted) {
      log.info('hysteresis_count_updated_via_config', {
        count: delta.hysteresis_probe_count,
      });
    }
  }

  if (
    'timeout_budgets' in delta &&
    delta.timeout_budgets?.probe_interval_ms !== undefined &&
    probeTimer
  ) {
    if (degradationMachine.isForceActive()) {
      lastProbeIntervalMs = delta.timeout_budgets.probe_interval_ms;
      log.info('probe_interval_updated_force_active', {
        interval_ms: delta.timeout_budgets.probe_interval_ms,
        note: 'timer not restarted — force-tier active',
      });
      return;
    }
    try {
      lastProbeIntervalMs = delta.timeout_budgets.probe_interval_ms;
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
  lastProbeIntervalMs = intervalMs;
  degradationMachine.setFloorTier(normalizeFloor(config.degradation_floor));
  degradationMachine.setHysteresisCount(config.hysteresis_probe_count);
  probeTimer.start(intervalMs);

  log.info('degradation_initialized', {
    floor: config.degradation_floor,
    probe_interval_ms: intervalMs,
    hysteresis_count: config.hysteresis_probe_count,
  });
}

export function shutdownDegradation(): void {
  if (probeTimer) {
    probeTimer.stop();
    probeTimer = null;
  }
  lastProbeIntervalMs = null;
  log.info('degradation_shutdown');
}

