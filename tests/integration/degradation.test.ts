import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { DegradationTier, type GraphQuery, type MemtraceBackend } from '../../src/types.js';
import { degradationMachine } from '../../src/degrade/machine.js';
import { ProbeTimer, initializeDegradation, shutdownDegradation } from '../../src/degrade/index.js';
import { MiddlewareError } from '../../src/errors.js';
import { BaseAdapter } from '../../src/interface/base-adapter.js';
import { createProbeMockBackend, createDegradationConfig } from '../fixtures/degradation-mock.js';
import { makeToolMessage, mockCapabilities } from '../helpers/test-utils.js';

describe('Degradation Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    degradationMachine.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    shutdownDegradation();
  });

  it('[P0] Full → IntentReduced via probe failures', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);
  });

  it('[P0] IntentReduced → Passthrough via additional probe failures', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 6);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  it('[P0] Passthrough → FailClosed via additional probe failures', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 9);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.FailClosed);
  });

  it('[P0] Full recovery: Passthrough → Full', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 6);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);

    degradationMachine.setFloorTier(DegradationTier.Full);
    const recoveryBackend = createProbeMockBackend({ probeFails: false });
    shutdownDegradation();

    const recoveryTimer = new ProbeTimer(recoveryBackend, degradationMachine);
    recoveryTimer.start(config.timeout_budgets.probe_interval_ms);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
    recoveryTimer.stop();
  });

  it('[P1] transition reason appears in response metadata', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 3);

    const reason = degradationMachine.getTransitionReason();
    expect(reason).not.toBeNull();
    expect(reason!.from).toBe(DegradationTier.Full);
    expect(reason!.to).toBe(DegradationTier.IntentReduced);
    expect(reason!.reason).toContain('consecutive probe failures');
  });

  it('[P1] floor enforcement at integration level', () => {
    const backend = createProbeMockBackend({ probeFails: false });
    const config = createDegradationConfig({ degradation_floor: 'Passthrough' });
    degradationMachine.setFloorTier(DegradationTier.Passthrough);

    initializeDegradation(backend, config);

    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);

    for (let i = 0; i < 3; i++) {
      degradationMachine.recordProbeResult(true);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);
  });

  it('[P1] single probe failure does not trigger tier change', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 1);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Full);
  });

  it('[P2] error type preserved end-to-end through degrade chain', async () => {
    const backend = createProbeMockBackend({ probeFails: true });
    const config = createDegradationConfig();
    initializeDegradation(backend, config);

    await vi.advanceTimersByTimeAsync(config.timeout_budgets.probe_interval_ms * 9);

    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.FailClosed);
    expect(degradationMachine.getTransitionReason()).not.toBeNull();
  });
});

describe('Degradation Dispatch Integration', () => {
  beforeEach(() => {
    vi.useRealTimers();
    degradationMachine.reset();
  });

  afterEach(() => {
    shutdownDegradation();
  });

  it('[P0] FailClosed dispatch returns structured error', async () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    for (let i = 0; i < 9; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.FailClosed);

    const backend = createProbeMockBackend({ probeFails: false });
    const adapter = new BaseAdapter(backend);
    const spy = vi.spyOn(backend, 'execute');

    const response = await adapter.dispatch(makeToolMessage('memtrace_find_code'));

    const parsed = JSON.parse(response.content[0].text as string);
    expect(parsed.tier).toBe(DegradationTier.FailClosed);
    expect(parsed.cause).toBe('memtrace_unavailable');
    expect(parsed.recoverable).toBe(false);
    expect(parsed.suggested_action).toBe('run_memtrace_start');
    expect(parsed.trace_id).toBeTypeOf('string');
    expect(response.metadata?.tier).toBe(DegradationTier.FailClosed);
    expect(spy).not.toHaveBeenCalled();
  });

  it('[P1] IntentReduced dispatch runs sequentially with single query', async () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);

    let callCount = 0;
    const backend: MemtraceBackend = {
      execute: async () => {
        callCount++;
        return {
          tool: 'memtrace_find_code',
          data: [],
          trace_id: 't1',
          elapsed_ms: 2,
          degraded: false,
        };
      },
      probe: async () => true,
      listTools: async () => mockCapabilities.tools,
    };
    const adapter = new BaseAdapter(backend);

    const response = await adapter.dispatch(makeToolMessage('memtrace_find_code'));

    expect(callCount).toBe(1);
    expect(response.metadata?.degradation_tier).toBe(DegradationTier.IntentReduced);
  });

  it('[P1] IntentReduced dispatch skips fusion enrichment and sets degradation_tier', async () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);

    const backend: MemtraceBackend = {
      execute: async (_q, _signal) => ({
        tool: 'memtrace_find_code',
        data: [{ name: 'foo', file_path: 'bar.ts', start_line: 1, end_line: 10, kind: 'Function' }],
        trace_id: 't1',
        elapsed_ms: 2,
        degraded: false,
      }),
      probe: async () => true,
      listTools: async () => mockCapabilities.tools,
    };
    const adapter = new BaseAdapter(backend);

    const response = await adapter.dispatch(makeToolMessage('memtrace_find_code'));

    expect(response.metadata?.degradation_tier).toBe(DegradationTier.IntentReduced);
    expect(response.metadata?.tier).toBeTypeOf('string');
  });

  it('[P1] Passthrough dispatch returns raw results with passthrough flag', async () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    for (let i = 0; i < 6; i++) {
      degradationMachine.recordProbeResult(false);
    }
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.Passthrough);

    const backend: MemtraceBackend = {
      execute: async () => ({
        tool: 'memtrace_find_code',
        data: [{ name: 'foo' }],
        trace_id: 't1',
        elapsed_ms: 2,
        degraded: false,
      }),
      probe: async () => true,
      listTools: async () => mockCapabilities.tools,
    };
    const adapter = new BaseAdapter(backend);

    const response = await adapter.dispatch(makeToolMessage('memtrace_find_code'));

    expect(response.metadata?.passthrough).toBe(true);
    expect(response.metadata?.degradation_tier).toBe(DegradationTier.Passthrough);
    expect(response.metadata?.tier).toBe(DegradationTier.Passthrough);
  });

  it('[P1] backend error is caught gracefully — dispatch returns partial result with metadata', async () => {
    const backend: MemtraceBackend = {
      execute: async () => {
        throw new MiddlewareError({
          cause: 'memtrace_unavailable',
          recoverable: true,
          suggested_action: 'retry_connection',
        });
      },
      probe: async () => true,
      listTools: async () => mockCapabilities.tools,
    };
    const adapter = new BaseAdapter(backend, {
      memtrace_host: '',
      memtrace_token: '',
      timeout_budgets: { sub_query_ms: 100, dispatch_ms: 5000, probe_interval_ms: 15000 },
      hysteresis_probe_count: 3,
      degradation_floor: 'Full',
      enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
      classification_threshold: 0.95,
    });

    const response = await adapter.dispatch(makeToolMessage('memtrace_find_code'));

    expect(response.content[0].text).toBe('no results');
    expect(response.metadata?.tier).toBeDefined();
    expect(response.metadata?.degradation_tier).toBeTypeOf('string');
  });

  it('[P0] degradation_tier and tier_transition appear in dispatch response metadata', async () => {
    degradationMachine.setFloorTier(DegradationTier.Full);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    degradationMachine.recordProbeResult(false);
    expect(degradationMachine.getCurrentTier()).toBe(DegradationTier.IntentReduced);

    const backend: MemtraceBackend = {
      execute: async () => ({
        tool: 'memtrace_find_code',
        data: [],
        trace_id: 't1',
        elapsed_ms: 2,
        degraded: false,
      }),
      probe: async () => true,
      listTools: async () => mockCapabilities.tools,
    };
    const adapter = new BaseAdapter(backend);

    const response = await adapter.dispatch(makeToolMessage('memtrace_find_code'));

    expect(response.metadata?.degradation_tier).toBe(DegradationTier.IntentReduced);
    expect(response.metadata?.tier_transition).toBeDefined();
    expect(response.metadata?.tier_transition?.reason).toContain('consecutive probe failures');
    expect(response.metadata?.tier_transition?.from).toBe(DegradationTier.Full);
    expect(response.metadata?.tier_transition?.to).toBe(DegradationTier.IntentReduced);
    expect(response.metadata?.tier_transition?.timestamp).toBeTypeOf('string');
  });
});
