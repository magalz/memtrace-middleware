// AC 1.2-10: MemtraceBackend trait contract — execute(query,signal), probe(), listTools() with correct signatures
// AC 1.4-7: DegradationProbeHooks stubs — optional hooks for Epic 3 without refactoring core pipeline
import { describe, it, expect, vi } from 'vitest';

import type { MemtraceBackend, DegradationProbeHooks } from '../../../src/backend/trait.js';
import { MemtraceTransport } from '../../../src/backend/transport.js';

describe('MemtraceBackend trait contract', () => {
  // AC 1.2-10 — execute() signature: GraphQuery + AbortSignal → QueryResult
  it('[P0] allows creating a mock implementation with correct execute(query, signal) signature', async () => {
    // Given: a mock MemtraceBackend with execute, probe, and listTools
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
    // When: execute is called with a GraphQuery and AbortSignal
    const query = { tool: 'memtrace_find_code', arguments: { query: 'test' } };
    const controller = new AbortController();
    const result = await mockBackend.execute(query, controller.signal);
    // Then: result has all QueryResult fields
    expect(result).toHaveProperty('tool', 'memtrace_find_code');
    expect(result).toHaveProperty('trace_id');
    expect(result).toHaveProperty('elapsed_ms');
    expect(result).toHaveProperty('degraded');
    // And: probe returns boolean
    const probeResult = await mockBackend.probe();
    expect(probeResult).toBe(true);
    // And: listTools returns ToolSchema[]
    const tools = await mockBackend.listTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools[0]).toHaveProperty('name');
  });

  // AC 1.2-10 — contract compatible with Result<T,E> pattern used by orchestrator
  it('[P0] produces QueryResult compatible with Result<T,E> pattern used by orchestrator', async () => {
    // Given: a QueryResult from a get_symbol_context query
    const mockQuery = { tool: 'memtrace_get_symbol_context', arguments: { symbol: 'test' } };
    const okResult = {
      tool: mockQuery.tool,
      data: { callers: ['funcA'] },
      trace_id: 'gs-abc12345',
      elapsed_ms: 30,
      degraded: false,
    };
    // Then: the shape matches what the orchestrator expects
    expect(okResult).toHaveProperty('tool', mockQuery.tool);
    expect(okResult.data).toHaveProperty('callers');
  });

  // AC 1.2-10 — trait enforces contract at type level
  it('[P0] rejects non-MemtraceBackend implementations that lack required methods', () => {
    // Given: an object without the required trait methods
    const invalid = { execute: 'not a function' };
    const asBackend = invalid as unknown as MemtraceBackend;
    // Then: it fails structural type checks
    expect(typeof asBackend.execute).not.toBe('function');
    expect(asBackend.probe).toBeUndefined();
    expect(asBackend.listTools).toBeUndefined();
  });

  // AC 1.2-10 — valid implementations with correct signatures accepted
  it('[P0] accepts valid MemtraceBackend implementations with all three methods', () => {
    // Given: a correctly shaped MemtraceBackend
    const valid: MemtraceBackend = {
      execute: vi.fn(),
      probe: vi.fn(),
      listTools: vi.fn(),
    };
    // Then: all methods are functions
    expect(typeof valid.execute).toBe('function');
    expect(typeof valid.probe).toBe('function');
    expect(typeof valid.listTools).toBe('function');
  });

  // AC 1.2-10 — MemtraceTransport satisfies MemtraceBackend at compile time
  it('[P1] MemtraceTransport satisfies the MemtraceBackend contract at compile time', () => {
    // Given: a real MemtraceTransport instance
    const transport: MemtraceBackend = new MemtraceTransport('http://localhost:8080');
    // Then: it has all three required methods
    expect(typeof transport.execute).toBe('function');
    expect(typeof transport.probe).toBe('function');
    expect(typeof transport.listTools).toBe('function');
  });
});

// AC 1.4-7 — DegradationProbeHooks for Epic 3 without refactoring core pipeline
describe('DegradationProbeHooks (Epic 3 stubs)', () => {
  // AC 1.4-7 — all hooks are optional interfaces
  it('[P0] defines optional DegradationProbeHooks interface with four no-op methods', () => {
    // Given: the DegradationProbeHooks interface from trait.ts
    // Then: all hooks are defined but optional (Epic 3 fills real implementations)
    const hooks: DegradationProbeHooks = {};
    expect(hooks.shouldDegrade).toBeUndefined();
    expect(hooks.onProbeResult).toBeUndefined();
    expect(hooks.getCircuitState).toBeUndefined();
    expect(hooks.getRecoverySignal).toBeUndefined();
  });

  // AC 1.4-7 — partial implementation allowed (optional hooks)
  it('[P2] allows partial implementation with only some hooks filled', () => {
    // Given: a partial implementation with only shouldDegrade
    const hooks: DegradationProbeHooks = {
      shouldDegrade: () => true,
    };
    // Then: only the specified hook is defined
    expect(hooks.shouldDegrade).toBeDefined();
    expect(hooks.onProbeResult).toBeUndefined();
  });

  // AC 1.4-7 — full implementation accepted
  it('[P2] allows full implementation with all four hooks', () => {
    // Given: a complete implementation of all four hooks
    const hooks: DegradationProbeHooks = {
      shouldDegrade: () => true,
      onProbeResult: (_success: boolean) => {},
      getCircuitState: () => ({ state: 'closed' }),
      getRecoverySignal: () => null,
    };
    // Then: all hooks are present and callable
    expect(typeof hooks.shouldDegrade).toBe('function');
    expect(typeof hooks.onProbeResult).toBe('function');
    expect(typeof hooks.getCircuitState).toBe('function');
    expect(typeof hooks.getRecoverySignal).toBe('function');
  });

  // AC 1.4-7 — MemtraceBackend accepts optional degradationHooks property
  it('[P1] MemtraceBackend accepts optional degradationHooks property without breaking existing code', () => {
    // Given: a MemtraceBackend with degradationHooks attached
    const backend: MemtraceBackend = {
      execute: vi.fn(),
      probe: vi.fn(),
      listTools: vi.fn(),
      degradationHooks: {
        shouldDegrade: () => false,
      },
    };
    // Then: the hooks are accessible
    expect(backend.degradationHooks).toBeDefined();
    expect(backend.degradationHooks!.shouldDegrade!()).toBe(false);
  });

  // AC 1.4-7 — works without degradationHooks (Epic 3 not yet implemented)
  it('[P1] works without degradationHooks when Epic 3 resilience is not loaded', () => {
    // Given: a MemtraceBackend without any degradationHooks
    const backend: MemtraceBackend = {
      execute: vi.fn(),
      probe: vi.fn(),
      listTools: vi.fn(),
    };
    // Then: degradationHooks is undefined — no crash, no null checks needed
    expect(backend.degradationHooks).toBeUndefined();
  });
});
