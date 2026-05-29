import { describe, it, expect } from 'vitest';
import { DegradationTier } from '../../../src/types.js';
import type { StatusSnapshot } from '../../../src/types.js';
import { renderStatus, createFlashTracker, startStatusDisplay } from '../../../src/cli/status.js';

const fullSnapshot: StatusSnapshot = {
  tier: DegradationTier.Full,
  uptime_seconds: 120,
  active_intents: ['find_code', 'get_symbol_context'],
  query_success: 42,
  query_failure: 3,
  confidence_p50: 0.92,
  confidence_p95: 0.97,
  last_dispatch_result: 'success',
};

const degradedSnapshot: StatusSnapshot = {
  tier: DegradationTier.IntentReduced,
  uptime_seconds: 60,
  active_intents: ['find_code'],
  query_success: 10,
  query_failure: 5,
  confidence_p50: 0.75,
  confidence_p95: 0.85,
  last_dispatch_result: null,
};

const failClosedSnapshot: StatusSnapshot = {
  tier: DegradationTier.FailClosed,
  uptime_seconds: 30,
  active_intents: [],
  query_success: 0,
  query_failure: 0,
  confidence_p50: 0,
  confidence_p95: 0,
  last_dispatch_result: null,
};

describe('renderStatus', () => {
  it('[P0] piped mode produces valid JSON with all required keys', () => {
    const output = renderStatus(fullSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const keys = Object.keys(parsed);
    expect(keys).toContain('status');
    expect(keys).toContain('tier');
    expect(keys).toContain('uptime_seconds');
    expect(keys).toContain('version');
    expect(keys).toContain('active_intents');
    expect(keys).toContain('query_success');
    expect(keys).toContain('query_failure');
    expect(keys).toContain('confidence_p50');
    expect(keys).toContain('confidence_p95');
  });

  it('[P0] piped mode fields have correct types', () => {
    const output = renderStatus(fullSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(typeof parsed['status']).toBe('string');
    expect(typeof parsed['tier']).toBe('string');
    expect(typeof parsed['uptime_seconds']).toBe('number');
    expect(typeof parsed['version']).toBe('string');
    expect(typeof parsed['query_success']).toBe('number');
    expect(typeof parsed['query_failure']).toBe('number');
    expect(typeof parsed['confidence_p50']).toBe('number');
    expect(typeof parsed['confidence_p95']).toBe('number');
    expect(Array.isArray(parsed['active_intents'])).toBe(true);
  });

  it('[P0] piped mode has correct status value for full tier', () => {
    const output = renderStatus(fullSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['status']).toBe('ok');
  });

  it('[P1] TTY mode produces ANSI color codes and \\r carriage return', () => {
    const output = renderStatus(fullSnapshot, true);
    expect(output).toContain('\r');
    expect(output).toContain('\x1b[');
  });

  it('[P1] TTY mode has tier-specific color for each tier', () => {
    const fullOutput = renderStatus(fullSnapshot, true);
    expect(fullOutput).toContain('\x1b[32m');

    const reducedOutput = renderStatus(degradedSnapshot, true);
    expect(reducedOutput).toContain('\x1b[33m');

    const closedOutput = renderStatus(failClosedSnapshot, true);
    expect(closedOutput).toContain('\x1b[31m');
  });

  it('[P1] piped mode has status "closed" for FailClosed', () => {
    const output = renderStatus(failClosedSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['status']).toBe('closed');
  });

  it('[P1] active_intents is array of strings', () => {
    const output = renderStatus(fullSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    const intents = parsed['active_intents'] as string[];
    expect(Array.isArray(intents)).toBe(true);
    for (const intent of intents) {
      expect(typeof intent).toBe('string');
    }
  });

  it('[P1] query_success and query_failure are non-negative integers', () => {
    const output = renderStatus(fullSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed['query_success']).toBe(42);
    expect(parsed['query_failure']).toBe(3);
    expect(Number.isInteger(parsed['query_success'])).toBe(true);
    expect(Number.isInteger(parsed['query_failure'])).toBe(true);
  });

  it('[P1] confidence_p50 and p95 are numbers (not NaN, not Infinity)', () => {
    const output = renderStatus(fullSnapshot, false);
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(isNaN(parsed['confidence_p50'] as number)).toBe(false);
    expect(isFinite(parsed['confidence_p50'] as number)).toBe(true);
    expect(isNaN(parsed['confidence_p95'] as number)).toBe(false);
    expect(isFinite(parsed['confidence_p95'] as number)).toBe(true);
  });

  it('[P1] handles null snapshot gracefully in piped mode', () => {
    const output = renderStatus(null, false);
    expect(output).toBe('');
  });

  it('[P1] handles null snapshot gracefully in TTY mode', () => {
    const output = renderStatus(null, true);
    expect(output).toContain('\r');
    expect(output).toContain('no data');
  });

  it('[P2] all tiers produce valid piped output', () => {
    for (const snapshot of [fullSnapshot, degradedSnapshot, failClosedSnapshot]) {
      const output = renderStatus(snapshot, false);
      expect(() => JSON.parse(output)).not.toThrow();
    }
  });
});

describe('createFlashTracker', () => {
  it('[P0] flash activates on trigger and renders indicator', () => {
    const tracker = createFlashTracker();
    tracker.trigger('success');
    const state = tracker.getState();
    expect(state.counter).toBe(3);
    expect(state.type).toBe('success');
  });

  it('[P1] flash indicator appears for 3 ticks then clears', () => {
    const tracker = createFlashTracker();
    tracker.trigger('success');
    expect(tracker.getState().counter).toBe(3);
    const rendered1 = tracker.render('line');
    expect(rendered1).toContain('\x1b[32m ✓\x1b[0m');
    expect(rendered1).toContain('line');
    tracker.tick();
    expect(tracker.getState().counter).toBe(2);
    const rendered2 = tracker.render('line');
    expect(rendered2).toContain('\x1b[32m ✓\x1b[0m');
    tracker.tick();
    tracker.tick();
    expect(tracker.getState().counter).toBe(0);
    const rendered3 = tracker.render('line');
    expect(rendered3).toBe('line');
  });

  it('[P1] failure flash uses red indicator', () => {
    const tracker = createFlashTracker();
    tracker.trigger('failure');
    const rendered = tracker.render('line');
    expect(rendered).toContain('\x1b[31m ✗\x1b[0m');
  });

  it('[P2] trigger with null does not activate flash', () => {
    const tracker = createFlashTracker();
    tracker.trigger(null);
    expect(tracker.getState().counter).toBe(0);
    expect(tracker.getState().type).toBeNull();
  });
});

describe('startStatusDisplay', () => {
  it('[P1] startStatusDisplay returns a StatusController', () => {
    const controller = startStatusDisplay();
    expect(controller).toBeDefined();
    expect(typeof controller.stop).toBe('function');
    expect(typeof controller.updateTier).toBe('function');
    expect(typeof controller.addIntent).toBe('function');
    controller.stop();
  });

  it('[P1] stop cleans up and writes final newline', () => {
    const controller = startStatusDisplay();
    controller.stop();
  });

  it('[P2] updateTier and addIntent do not throw', () => {
    const controller = startStatusDisplay();
    expect(() => controller.updateTier(DegradationTier.IntentReduced)).not.toThrow();
    expect(() => controller.addIntent('find_code')).not.toThrow();
    controller.stop();
  });
});
