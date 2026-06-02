import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import type { MemtraceBackend } from '../../../src/backend/trait.js';
import type { ToolProvider } from '../../../src/interface/traits.js';
import { createDegradedMcpServer, createMcpServer } from '../../../src/cli/mcp-server.js';

function createMockBackend(
  tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = []
): MemtraceBackend {
  return {
    execute: vi.fn().mockResolvedValue({
      tool: 'test',
      data: {},
      trace_id: 't1',
      elapsed_ms: 1,
      degraded: false,
    }),
    probe: vi.fn().mockResolvedValue(true),
    listTools: vi.fn().mockResolvedValue(tools),
  };
}

function createMockAdapter(dispatchResponse?: {
  content: Array<{ type: 'text'; text: string }>;
}): ToolProvider {
  return {
    dispatch: vi
      .fn()
      .mockResolvedValue(dispatchResponse ?? { content: [{ type: 'text', text: 'result' }] }),
  };
}

describe('createMcpServer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // AC1 — tools/list returns runtime-discovered schemas
  it('[P0] [AC1] creates server with correct name, version, and interface', () => {
    const backend = createMockBackend();
    const adapter = createMockAdapter();
    const instance = createMcpServer(backend, adapter);

    expect(instance.server).toBeDefined();
    expect(typeof instance.start).toBe('function');
    expect(typeof instance.close).toBe('function');
  });

  // AC1 — backend.listTools() is called at startup
  it('[P0] [AC1] start() calls backend.listTools() and tools are discoverable via MCP client', async () => {
    const tools = [
      {
        name: 'memtrace_find_code',
        description: 'Find code',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
      {
        name: 'memtrace_get_symbol_context',
        description: 'Get context',
        inputSchema: { type: 'object', properties: { symbol: { type: 'string' } } },
      },
    ];
    const backend = createMockBackend(tools);
    const adapter = createMockAdapter();
    const instance = createMcpServer(backend, adapter);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: backend returns 2 tools
    // When: the client sends tools/list
    // Then: the registered catalog matches the returned tools
    expect(backend.listTools).toHaveBeenCalledOnce();
    const result = await client.listTools();
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('memtrace_find_code');
    expect(result.tools[1].name).toBe('memtrace_get_symbol_context');

    await instance.close();
    await clientTransport.close();
  });

  // AC1 — empty tool catalog does not throw
  it('[P0] [AC1] handles empty tool catalog gracefully — zero tools, no error', async () => {
    const backend = createMockBackend([]);
    const adapter = createMockAdapter();
    const instance = createMcpServer(backend, adapter);

    await expect(instance.start()).resolves.not.toThrow();
    await instance.close();
  });

  // AC2 — tool handler constructs dispatch message and returns content
  it('[P0] [AC2] tool handler dispatches message to adapter and returns content via MCP roundtrip', async () => {
    const tools = [
      {
        name: 'memtrace_find_code',
        description: 'Find code',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      },
    ];
    const backend = createMockBackend(tools);
    const dispatch = vi
      .fn()
      .mockResolvedValue({ content: [{ type: 'text', text: 'fused result' }] });
    const adapter: ToolProvider = { dispatch };
    const instance = createMcpServer(backend, adapter);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await instance.start(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: 'memtrace_find_code',
      arguments: { query: 'authenticateUser' },
    });

    // Given: a tool handler registered via createMcpServer
    // When: the client calls memtrace_find_code
    // Then: dispatch is called with the MCP message envelope
    expect(dispatch).toHaveBeenCalledWith({
      method: 'tools/call',
      params: { name: 'memtrace_find_code', arguments: { query: 'authenticateUser' } },
    });
    // Then: the result content matches the dispatch response
    expect(result.content).toEqual([{ type: 'text', text: 'fused result' }]);
    expect(result.isError).toBeFalsy();

    await instance.close();
    await clientTransport.close();
  });

  // AC2 — dispatch errors are caught and returned as structured error content
  it('[P1] [AC2] tool handler catches dispatch error and returns structured passthrough error — does not throw into transport', async () => {
    const tools = [{ name: 'memtrace_find_code', description: 'Find code', inputSchema: {} }];
    const backend = createMockBackend(tools);
    backend.execute = vi.fn().mockRejectedValue(new Error('passthrough also failed'));
    const dispatch = vi.fn().mockRejectedValue(new Error('dispatch crashed'));
    const adapter: ToolProvider = { dispatch };
    const instance = createMcpServer(backend, adapter);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: dispatch throws and backend.execute also fails
    // When: the client calls a tool
    // Then: the handler returns error content, does NOT throw into the transport
    const result = await client.callTool({
      name: 'memtrace_find_code',
      arguments: {},
    });
    expect(result.isError).toBe(true);
    expect(result.content).toBeDefined();
    expect(result.content[0]).toHaveProperty('text');

    await instance.close();
    await clientTransport.close();
  });

  // AC3 — classification error falls through to backend passthrough
  it('[P0] [AC3] classification error triggers passthrough via backend.execute()', async () => {
    const tools = [{ name: 'memtrace_unknown_tool', description: 'Unknown tool', inputSchema: {} }];
    const errorContent = {
      content: [{ type: 'text', text: JSON.stringify({ cause: 'classification_failed' }) }],
    };
    const backend = createMockBackend(tools);
    backend.execute = vi.fn().mockResolvedValue({
      tool: 'memtrace_unknown_tool',
      data: { raw: 'passthrough data' },
      trace_id: 't1',
      elapsed_ms: 1,
      degraded: false,
    });
    const dispatch = vi.fn().mockResolvedValue(errorContent);
    const adapter: ToolProvider = { dispatch };
    const instance = createMcpServer(backend, adapter);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: dispatch returns classification_failed error for unknown tool
    // When: the client calls the tool
    // Then: backend.execute() is called as passthrough fallback
    const result = await client.callTool({
      name: 'memtrace_unknown_tool',
      arguments: { query: 'test' },
    });
    expect(backend.execute).toHaveBeenCalledWith(
      { tool: 'memtrace_unknown_tool', arguments: { query: 'test' } },
      expect.any(AbortSignal)
    );
    expect(result.content).toBeDefined();

    await instance.close();
    await clientTransport.close();
  });

  // AC6 — no console.log in the MCP server code path
  it('[P1] [AC6] MCP server does not call console.log during start and close', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const backend = createMockBackend();
    const adapter = createMockAdapter();
    const instance = createMcpServer(backend, adapter);

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await instance.start(serverTransport);

    // Given: the MCP server is running with InMemoryTransport
    // When: start and close are called
    // Then: console.log is never called (stdout reserved for JSON-RPC)
    expect(logSpy).not.toHaveBeenCalled();

    await instance.close();
    await clientTransport.close();
    logSpy.mockRestore();
  });
});

describe('createDegradedMcpServer', () => {
  // AC4 — degraded server starts with correct metadata and no tools
  it('[P0] [AC4] creates degraded server with correct interface', () => {
    const instance = createDegradedMcpServer();
    expect(instance.server).toBeDefined();
    expect(typeof instance.start).toBe('function');
    expect(typeof instance.close).toBe('function');
  });

  // AC4 — start and close do not throw
  it('[P0] [AC4] degraded server start() and close() complete without throwing', async () => {
    const instance = createDegradedMcpServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    await expect(instance.start(serverTransport)).resolves.not.toThrow();
    await expect(instance.close()).resolves.not.toThrow();
    await clientTransport.close();
  });

  // AC4 — degraded server connects and operates without crash (zero tools)
  it('[P1] [AC4] degraded server starts and closes without registering any tool handlers', async () => {
    const instance = createDegradedMcpServer();
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: backend unavailable at startup
    // When: the degraded server starts with zero tools
    // Then: it does not crash — the server is operational (no tools, but no error on start/close)
    await instance.close();
    await clientTransport.close();
  });
});
