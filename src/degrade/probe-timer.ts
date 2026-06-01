import type { MemtraceBackend } from '../backend/trait.js';
import { PROBE_INTERVAL_MS } from '../constants.js';
import { createLogger } from '../logger.js';
import { type DegradationMachine } from './machine.js';

const log = createLogger('degrade');

export class ProbeTimer {
  private readonly backend: MemtraceBackend;
  private readonly machine: DegradationMachine;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(backend: MemtraceBackend, machine: DegradationMachine) {
    this.backend = backend;
    this.machine = machine;
  }

  start(intervalMs: number = PROBE_INTERVAL_MS): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.intervalId = setInterval(async () => {
      try {
        const result = await this.backend.probe();
        this.machine.recordProbeResult(result);
        if (result) {
          log.debug('probe_success');
        } else {
          log.warn('probe_failure', { reason: 'backend returned false' });
        }
      } catch (err: unknown) {
        this.machine.recordProbeResult(false);
        log.warn('probe_failure', {
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }, intervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  restart(intervalMs: number = PROBE_INTERVAL_MS): void {
    this.stop();
    try {
      this.start(intervalMs);
    } catch {
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}
