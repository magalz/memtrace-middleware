import { createLogger } from '../logger.js';
import { DegradationTier } from '../types.js';

const log = createLogger('degrade');

interface TierTransition {
  from: DegradationTier;
  to: DegradationTier;
  reason: string;
  timestamp: string;
}

const TIER_ORDINAL: Record<DegradationTier, number> = {
  [DegradationTier.Full]: 0,
  [DegradationTier.IntentReduced]: 1,
  [DegradationTier.Passthrough]: 2,
  [DegradationTier.FailClosed]: 3,
};

function ordinal(tier: DegradationTier): number {
  return TIER_ORDINAL[tier];
}

function degradeTier(tier: DegradationTier): DegradationTier {
  if (tier === DegradationTier.Full) return DegradationTier.IntentReduced;
  if (tier === DegradationTier.IntentReduced) return DegradationTier.Passthrough;
  if (tier === DegradationTier.Passthrough) return DegradationTier.FailClosed;
  return DegradationTier.FailClosed;
}

export class DegradationMachine {
  private currentTier: DegradationTier = DegradationTier.Full;
  private consecutiveProbeFailures = 0;
  private consecutiveProbeSuccesses = 0;
  private floorTier: DegradationTier = DegradationTier.Full;
  private forceTier: DegradationTier | null = null;
  private hysteresisProbeCount = 3;
  private lastTransitionReason: string | null = null;
  private lastTransitionAt: string | null = null;
  private tierHistory: TierTransition[] = [];

  setForceTier(tier: DegradationTier): void {
    this.forceTier = tier;
    log.info('force_tier_active', { tier });
  }

  clearForceTier(): void {
    if (this.forceTier !== null) {
      const previous = this.forceTier;
      this.forceTier = null;
      log.info('force_tier_cleared', { previous });
    }
  }

  isForceActive(): boolean {
    return this.forceTier !== null;
  }

  recordProbeResult(success: boolean): DegradationTier {
    if (this.forceTier !== null) {
      return this.forceTier;
    }

    if (success) {
      this.consecutiveProbeFailures = 0;
      this.consecutiveProbeSuccesses++;

      if (
        this.consecutiveProbeSuccesses >= this.hysteresisProbeCount &&
        this.currentTier !== DegradationTier.Full
      ) {
        this.transition(
          DegradationTier.Full,
          `${this.hysteresisProbeCount} consecutive probe successes — recovered to Full`
        );
        this.consecutiveProbeSuccesses = 0;
      }
    } else {
      this.consecutiveProbeSuccesses = 0;
      this.consecutiveProbeFailures++;

      if (this.consecutiveProbeFailures >= this.hysteresisProbeCount) {
        if (this.currentTier !== DegradationTier.FailClosed) {
          const nextTier = degradeTier(this.currentTier);
          this.transition(
            nextTier,
            `${this.hysteresisProbeCount} consecutive probe failures — degraded to ${nextTier}`
          );
        }
        this.consecutiveProbeFailures = 0;
      }
    }

    return this.currentTier;
  }

  getCurrentTier(): DegradationTier {
    return this.forceTier ?? this.currentTier;
  }

  getFloorTier(): DegradationTier {
    return this.floorTier;
  }

  getTransitionReason(): {
    reason: string;
    from: DegradationTier;
    to: DegradationTier;
    timestamp: string;
  } | null {
    if (!this.lastTransitionReason) {
      return null;
    }

    const lastTransition = this.tierHistory[this.tierHistory.length - 1];
    if (!lastTransition) {
      return null;
    }

    return {
      reason: this.lastTransitionReason,
      from: lastTransition.from,
      to: lastTransition.to,
      timestamp: this.lastTransitionAt ?? new Date().toISOString(),
    };
  }

  setFloorTier(tier: DegradationTier): void {
    if (tier == null || !(tier in TIER_ORDINAL)) {
      log.warn('set_floor_tier_invalid', { tier });
      return;
    }
    this.floorTier = tier;
  }

  setHysteresisCount(count: number): boolean {
    if (!Number.isFinite(count) || count < 1 || !Number.isInteger(count)) {
      log.warn('set_hysteresis_count_invalid', { count });
      return false;
    }
    if (count > 10_000) {
      log.warn('set_hysteresis_count_excessive', { count });
    }
    const previous = this.hysteresisProbeCount;
    this.hysteresisProbeCount = count;
    if (count !== previous) {
      log.info('hysteresis_count_updated', { previous, current: count });
    }
    return true;
  }

  reset(): void {
    this.currentTier = DegradationTier.Full;
    this.consecutiveProbeFailures = 0;
    this.consecutiveProbeSuccesses = 0;
    this.forceTier = null;
    this.lastTransitionReason = null;
    this.lastTransitionAt = null;
    this.tierHistory = [];
  }

  private transition(newTier: DegradationTier, reason: string): void {
    const previousTier = this.currentTier;

    const isUpgrade = ordinal(newTier) < ordinal(previousTier);

    if (isUpgrade && ordinal(newTier) < ordinal(this.floorTier)) {
      this.currentTier = this.floorTier;
      const blockedReason = `floor enforcement: upgrade to ${newTier} blocked by floor ${this.floorTier}`;
      this.lastTransitionReason = blockedReason;
      this.lastTransitionAt = new Date().toISOString();
      this.tierHistory.push({
        from: previousTier,
        to: this.currentTier,
        reason: blockedReason,
        timestamp: this.lastTransitionAt,
      });
      log.warn('upgrade_blocked_by_floor', { target: newTier, floor: this.floorTier });
      return;
    }

    this.currentTier = newTier;
    this.lastTransitionReason = reason;
    this.lastTransitionAt = new Date().toISOString();
    this.tierHistory.push({
      from: previousTier,
      to: this.currentTier,
      reason,
      timestamp: this.lastTransitionAt,
    });

    if (newTier === DegradationTier.FailClosed) {
      log.error('tier_transition', { from: previousTier, to: newTier, reason });
    } else {
      log.info('tier_transition', { from: previousTier, to: newTier, reason });
    }
  }
}

export const degradationMachine = new DegradationMachine();

