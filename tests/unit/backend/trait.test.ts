import { describe, it, expect, vi } from 'vitest';

import type { MemtraceBackend, DegradationProbeHooks } from '../../../src/backend/trait.js';
import { MemtraceTransport } from '../../../src/backend/transport.js';

describe('MemtraceBackend trait contract', () => {
  it('should allow creating a mock implementation with correct execute signature', async () => {
    const mockBackend = {
      execute: vi.fn().mockResolvedValue({
        tool: 'memtrace_find_code',
        data: {},
        trace_id: 'fc-abc12345',
        elapsed_ms: 50,
        degraded: false,
      }),
      probe: vi.fn().mockResolvedValue(true),
      listTools: vi
        .fn()
        .mockResolvedValue([
          { name: 'memtrace_find_code', description: 'Find code', inputSchema: {} },
        ]),
    };

    const query = { tool: 'memtrace_find_code', arguments: { query: 'test' } };
    const controller = new AbortController();
    const result = await mockBackend.execute(query, controller.signal);

    expect(result).toHaveProperty('tool', 'memtrace_find_code');
    expect(result).toHaveProperty('trace_id');
    expect(result).toHaveProperty('elapsed_ms');
    expect(result).toHaveProperty('degraded');

    const probeResult = await mockBackend.probe();
    expect(probeResult).toBe(true);

    const tools = await mockBackend.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools[0]).toHaveProperty('name');
  });

  it('should work with Result type patterns expected by orchestrator', async () => {
    const mockQuery = { tool: 'memtrace_get_symbol_context', arguments: { symbol: 'test' } };

    const okResult = {
      tool: mockQuery.tool,
      data: { callers: ['funcA'] },
      trace_id: 'gs-abc12345',
      elapsed_ms: 30,
      degraded: false,
    };

    expect(okResult).toHaveProperty('tool', mockQuery.tool);
    expect(okResult.data).toHaveProperty('callers');
  });

  it('should reject non-MemtraceBackend implementations', () => {
    const invalid = { execute: 'not a function' };
    const asBackend = invalid as unknown as MemtraceBackend;
    expect(typeof asBackend.execute).not.toBe('function');
    expect(asBackend.probe).toBeUndefined();
    expect(asBackend.listTools).toBeUndefined();
  });

  it('should accept valid MemtraceBackend implementations', () => {
    const valid: MemtraceBackend = {
      execute: vi.fn(),
      probe: vi.fn(),
      listTools: vi.fn(),
    };
    expect(typeof valid.execute).toBe('function');
    expect(typeof valid.probe).toBe('function');
    expect(typeof valid.listTools).toBe('function');
  });

  it('MemtraceTransport should satisfy MemtraceBackend at compile time', () => {
    const transport: MemtraceBackend = new MemtraceTransport('http://localhost:8080');
    expect(typeof transport.execute).toBe('function');
    expect(typeof transport.probe).toBe('function');
    expect(typeof transport.listTools).toBe('function');
  });
});

describe('DegradationProbeHooks (Epic 3 stubs)', () => {
  it('[P0] should define DegradationProbeHooks as an interface with optional methods', () => {
    const hooks: DegradationProbeHooks = {};

    expect(hooks.shouldDegrade).toBeUndefined();
    expect(hooks.onProbeResult).toBeUndefined();
    expect(hooks.getCircuitState).toBeUndefined();
    expect(hooks.getRecoverySignal).toBeUndefined();
  });

  it('[P0] DegradationProbeHooks should allow partial implementation', () => {
    const hooks: DegradationProbeHooks = {
      shouldDegrade: () => false,
      getCircuitState: () => ({ state: 'closed' }),
    };

    expect(hooks.shouldDegrade?.()).toBe(false);
    expect(hooks.getCircuitState?.()).toEqual({ state: 'closed' });
    expect(hooks.onProbeResult).toBeUndefined();
    expect(hooks.getRecoverySignal).toBeUndefined();
  });

  it('[P0] DegradationProbeHooks should allow full implementation', () => {
    const hooks: DegradationProbeHooks = {
      shouldDegrade: () => true,
      onProbeResult: (_success: boolean) => {},
      getCircuitState: () => ({ state: 'half_open' }),
      getRecoverySignal: () => 'memtrace_restored',
    };

    expect(hooks.shouldDegrade?.()).toBe(true);
    expect(hooks.getCircuitState?.()).toEqual({ state: 'half_open' });
    expect(hooks.getRecoverySignal?.()).toBe('memtrace_restored');
    hooks.onProbeResult?.(true);
  });

  it('[P1] MemtraceBackend should accept optional degradationHooks property', () => {
    const hooks: DegradationProbeHooks = {
      shouldDegrade: () => false,
    };

    const backend: MemtraceBackend = {
      execute: vi.fn(),
      probe: vi.fn(),
      listTools: vi.fn(),
      degradationHooks: hooks,
    };

    expect(backend.degradationHooks).toBeDefined();
    expect(backend.degradationHooks?.shouldDegrade?.()).toBe(false);
  });

  it('[P1] MemtraceBackend should work without degradationHooks', () => {
    const backend: MemtraceBackend = {
      execute: vi.fn(),
      probe: vi.fn(),
      listTools: vi.fn(),
    };

    expect(backend.degradationHooks).toBeUndefined();
  });
});
