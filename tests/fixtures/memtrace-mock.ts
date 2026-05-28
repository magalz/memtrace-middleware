import http from 'node:http';

export interface MockTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MockOptions {
  failureMode?: 'none' | 'reject' | 'slow';
  delayMs?: number;
}

const DEFAULT_TOOLS: MockTool[] = [
  {
    name: 'memtrace_find_code',
    description: 'Find code by symbol name or pattern',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        repo_id: { type: 'string' },
      },
    },
  },
  {
    name: 'memtrace_get_symbol_context',
    description: 'Get 360-degree context for a symbol',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
        repo_id: { type: 'string' },
      },
    },
  },
  {
    name: 'memtrace_get_impact',
    description: 'Compute blast radius for a symbol',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        repo_id: { type: 'string' },
      },
    },
  },
];

const TOOL_RESPONSES: Record<string, unknown> = {
  memtrace_find_code: {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          results: [
            {
              name: 'authenticateUser',
              file_path: 'src/auth/service.ts',
              start_line: 42,
              end_line: 67,
              kind: 'Function',
            },
          ],
          query: 'authenticateUser',
          total: 1,
        }),
      },
    ],
  },
  memtrace_get_symbol_context: {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          symbol: 'authenticateUser',
          callers: ['loginHandler', 'verifySession'],
          callees: ['db.query', 'bcrypt.compare'],
          file_path: 'src/auth/service.ts',
          start_line: 42,
        }),
      },
    ],
  },
  memtrace_get_impact: {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          symbol: 'authenticateUser',
          risk: 'Medium',
          affected_files: ['src/auth/service.ts', 'src/auth/login.ts'],
          depth: 2,
        }),
      },
    ],
  },
};

export function createMockMemtrace(opts: MockOptions = {}): {
  url: string;
  close: () => Promise<void>;
} {
  if (opts.failureMode === 'reject') {
    return {
      url: 'http://localhost:1',
      close: async () => {},
    };
  }

  const server = http.createServer(async (req, res) => {
    if (opts.failureMode === 'slow' && opts.delayMs) {
      await new Promise((r) => setTimeout(r, opts.delayMs));
    }

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end();
      return;
    }

    let body = '';
    for await (const chunk of req) {
      body += chunk;
    }

    let message: { method?: string; id?: number | string; params?: Record<string, unknown> };
    try {
      message = JSON.parse(body);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        })
      );
      return;
    }

    if (message.method === 'initialize') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2025-11-25',
            capabilities: { tools: {} },
            serverInfo: { name: 'memtrace-mock', version: '1.0.0' },
          },
        })
      );
    } else if (message.method === 'notifications/initialized') {
      res.writeHead(202);
      res.end();
    } else if (message.method === 'tools/list') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: { tools: DEFAULT_TOOLS },
        })
      );
    } else if (message.method === 'tools/call') {
      const toolName = message.params?.name;

      if (toolName && TOOL_RESPONSES[toolName]) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: TOOL_RESPONSES[toolName],
          })
        );
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: message.id,
            result: { content: [{ type: 'text', text: '{}' }] },
          })
        );
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: message.id,
          result: {},
        })
      );
    }
  });

  server.listen(0);
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    url: `http://localhost:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
