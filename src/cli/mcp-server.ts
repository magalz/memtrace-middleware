import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';

import type { MemtraceBackend } from '../backend/trait.js';
import { MIDDLEWARE_VERSION } from '../constants.js';
import type { AgentResponse, ToolProvider } from '../interface/traits.js';
import { createLogger } from '../logger.js';

const log = createLogger('mcp-server');

export interface McpServerInstance {
  server: McpServer;
  start(transport?: Transport): Promise<void>;
  close(): Promise<void>;
}

function isClassificationError(response: AgentResponse): boolean {
  const content = response.content?.[0];
  if (!content || content.type !== 'text') return false;
  try {
    const parsed = JSON.parse(content.text);
    return (
      parsed?.cause === 'classification_failed' ||
      parsed?.cause === 'classification_low_confidence'
    );
  } catch {
    return false;
  }
}

function safeStringify(data: unknown): string {
  try {
    const result = JSON.stringify(data);
    return result ?? '';
  } catch {
    return String(data);
  }
}

function createPassthroughResponse(
  toolName: string,
  args: Record<string, unknown>,
  backend: MemtraceBackend,
  onError: (err: unknown) => void,
) {
  return async (): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> => {
    const controller = new AbortController();
    const query = { tool: toolName, arguments: args };
    try {
      const result = await backend.execute(query, controller.signal);
      return { content: [{ type: 'text' as const, text: safeStringify(result.data) }] };
    } catch (passthroughErr) {
      onError(passthroughErr);
      return {
        content: [
          {
            type: 'text' as const,
            text: passthroughErr instanceof Error ? passthroughErr.message : String(passthroughErr),
          },
        ],
        isError: true,
      };
    }
  };
}

function createToolHandler(toolName: string, adapter: ToolProvider, backend: MemtraceBackend) {
  return async (args: Record<string, unknown>) => {
    const message = {
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };

    try {
      const response = await adapter.dispatch(message);

      if (isClassificationError(response)) {
        return createPassthroughResponse(toolName, args, backend, (err) => {
          log.warn('passthrough_error', {
            tool: toolName,
            error: err instanceof Error ? err.message : String(err),
          });
        })();
      }

      return { content: response.content, ...(response.metadata ? { _meta: response.metadata } : {}) };
    } catch (err: unknown) {
      log.warn('dispatch_crashed', {
        tool: toolName,
        error: err instanceof Error ? err.message : String(err),
      });
      return createPassthroughResponse(toolName, args, backend, () => {})();
    }
  };
}

function convertInputSchema(inputSchema: Record<string, unknown>): z.ZodType {
  if (inputSchema && typeof inputSchema === 'object' && 'type' in inputSchema) {
    const schema = inputSchema as Record<string, unknown>;
    if (schema.type === 'object' && typeof schema.properties === 'object') {
      try {
        const shape: Record<string, z.ZodType> = {};
        for (const [key, prop] of Object.entries(schema.properties as Record<string, unknown>)) {
          if (typeof prop === 'object' && prop !== null) {
            const p = prop as Record<string, unknown>;
            if (p.type === 'string') shape[key] = z.string().optional();
            else if (p.type === 'number') shape[key] = z.number().optional();
            else if (p.type === 'boolean') shape[key] = z.boolean().optional();
            else shape[key] = z.unknown().optional();
          }
        }
        if (Object.keys(shape).length > 0) {
          return z.object(shape).passthrough();
        }
      } catch {
        log.debug('input_schema_conversion_failed', {});
      }
    }
  }
  return z.object({}).passthrough();
}

async function connectToTransport(mcpServer: McpServer, transport?: Transport): Promise<void> {
  const t = transport ?? new StdioServerTransport();
  await mcpServer.connect(t);
}

export function createMcpServer(
  backend: MemtraceBackend,
  adapter: ToolProvider,
): McpServerInstance {
  const mcpServer = new McpServer({
    name: 'memtrace-middleware',
    version: MIDDLEWARE_VERSION,
  });

  async function registerTools(): Promise<number> {
    const tools = await backend.listTools();
    for (const tool of tools) {
      const inputSchema = convertInputSchema(tool.inputSchema);
      mcpServer.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema,
        },
        createToolHandler(tool.name, adapter, backend),
      );
    }
    return tools.length;
  }

  return {
    server: mcpServer,

    async start(transport?: Transport) {
      const toolCount = await registerTools();
      await connectToTransport(mcpServer, transport);
      log.info('mcp_server_started', { tool_count: toolCount });
    },

    async close() {
      await mcpServer.close();
      log.info('mcp_server_stopped');
    },
  };
}

export function createDegradedMcpServer(): McpServerInstance {
  const mcpServer = new McpServer({
    name: 'memtrace-middleware',
    version: MIDDLEWARE_VERSION,
  });

  return {
    server: mcpServer,

    async start(transport?: Transport) {
      await connectToTransport(mcpServer, transport);
      log.warn('degraded_mode_started');
    },

    async close() {
      await mcpServer.close();
      log.info('mcp_server_stopped');
    },
  };
}
