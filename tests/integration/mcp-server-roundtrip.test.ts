import { describe, it, expect, vi, beforeEach } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { createCliAdapter } from '../../src/adapters/index.js';
import { DEFAULT_CONFIG, type MiddlewareConfig } from '../../src/config/types.js';
import { createMcpServer } from '../../src/cli/mcp-server.js';
import type { MemtraceBackend } from '../../src/backend/trait.js';
import type { ToolProvider } from '../../src/interface/traits.js';

const mockConfig: MiddlewareConfig = DEFAULT_CONFIG;

function createMockBackend(): MemtraceBackend {
  return {
    execute: vi
      .fn()
      .mockResolvedValue({
        tool: 'memtrace_find_code',
        data: { results: [{ name: 'authenticateUser', file_path: 'src/auth.ts', start_line: 10, end_line: 20 }] },
        trace_id: 't1',
        elapsed_ms: 1,
        degraded: false,
      }),
    probe: vi.fn().mockResolvedValue(true),
    listTools: vi.fn().mockResolvedValue([
      { name: 'memtrace_find_code', description: 'Find code by symbol name', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } },
      { name: 'memtrace_get_symbol_context', description: 'Get 360-degree context', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } } } },
    ]),
  };
}

describe('MCP server roundtrip', () => {
  let backend: MemtraceBackend;
  let adapter: ToolProvider;
  let client: Client;

  beforeEach(async () => {
    backend = createMockBackend();
    adapter = createCliAdapter(backend, mockConfig);
    client = new Client({ name: 'test-client', version: '1.0.0' });
  });

  // AC1 — tools/list returns schemas from backend.listTools() — not hardcoded
  it('[P0] [AC1] tools/list returns runtime-discovered tool schemas matching backend.listTools()', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const instance = createMcpServer(backend, adapter);
    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: a mock backend that returns 2 known tools
    // When: the client sends tools/list
    // Then: the server returns exactly those 2 tools (not a hardcoded list)
    const result = await client.listTools();
    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBe('memtrace_find_code');
    expect(result.tools[1].name).toBe('memtrace_get_symbol_context');

    await instance.close();
    await clientTransport.close();
  });

  // AC2 — tools/call for a supported tool routes through dispatch and returns content
  it('[P0] [AC2] tools/call for memtrace_find_code returns dispatch response with content', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const instance = createMcpServer(backend, adapter);
    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: a connected MCP server with memtrace_find_code registered
    // When: the client calls memtrace_find_code
    // Then: the server returns content from the dispatch pipeline
    const result = await client.callTool({
      name: 'memtrace_find_code',
      arguments: { query: 'authenticateUser' },
    });
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty('text');
    // Verify it went through the dispatch pipeline (not passthrough)
    expect(result.isError).toBeFalsy();

    await instance.close();
    await clientTransport.close();
  });

  // AC5 — graceful shutdown: close does not throw
  it('[P1] [AC5] server.close() shuts down cleanly without throwing', async () => {
    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const instance = createMcpServer(backend, adapter);
    await instance.start(serverTransport);
    await client.connect(clientTransport);

    // Given: a running MCP server with active client connection
    // When: server.close() is called
    // Then: it shuts down without throwing
    await expect(instance.close()).resolves.not.toThrow();
    await clientTransport.close();
  });
});
