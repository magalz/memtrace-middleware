#!/usr/bin/env node

import { createCliAdapter } from '../adapters/index.js';
import type { MemtraceBackend } from '../backend/trait.js';
import { MemtraceTransport } from '../backend/transport.js';
import { DEFAULT_CONFIG, type MiddlewareConfig } from '../config/types.js';
import { MIDDLEWARE_VERSION, STATUS_REFRESH_MS } from '../constants.js';
import { initializeDegradation, shutdownDegradation } from '../degrade/index.js';
import { createLogger } from '../logger.js';
import type { QueryResult, ToolSchema, GraphQuery } from '../types.js';
import { createDegradedMcpServer, createMcpServer, type McpServerInstance } from './mcp-server.js';
import { startStatusDisplay } from './status.js';

const log = createLogger('cli');

let activeMcpServer: McpServerInstance | null = null;
let activeBackend: MemtraceBackend | null = null;

function createNoopBackend(): MemtraceBackend {
  return {
    async execute(_query: GraphQuery, _signal: AbortSignal): Promise<QueryResult> {
      throw new Error('not connected');
    },
    async probe(): Promise<boolean> {
      return false;
    },
    async listTools(): Promise<ToolSchema[]> {
      return [];
    },
  };
}

function printUsage(): void {
  process.stderr.write('usage: memtrace --status | start\n');
}

export async function startServer(config: MiddlewareConfig = DEFAULT_CONFIG): Promise<void> {
  if (activeMcpServer) {
    log.warn('server_already_running');
    return;
  }

  log.info('server_starting', { version: MIDDLEWARE_VERSION });

  try {
    const transport = new MemtraceTransport();
    await transport.connect();
    activeBackend = transport;
    log.info('backend_connected');

    initializeDegradation(transport, config);
    const adapter = createCliAdapter(transport, config);
    const mcpServer = createMcpServer(transport, adapter);
    activeMcpServer = mcpServer;

    process.stderr.write(`memtrace-middleware v${MIDDLEWARE_VERSION} — MCP server started\n`);
    await mcpServer.start();
  } catch (err: unknown) {
    log.warn('backend_connection_failed', {
      error: err instanceof Error ? err.message : String(err),
    });

    if (activeBackend && 'disconnect' in activeBackend) {
      try {
        await (activeBackend as MemtraceTransport).disconnect();
      } catch {
        // best-effort cleanup
      }
    }
    shutdownDegradation();

    process.stderr.write(
      `Warning: Memtrace backend unavailable — starting in degraded mode\n`,
    );

    const noop = createNoopBackend();
    activeBackend = noop;
    initializeDegradation(noop, config);
    const mcpServer = createDegradedMcpServer();
    activeMcpServer = mcpServer;

    process.stderr.write(`memtrace-middleware v${MIDDLEWARE_VERSION} — degraded mode\n`);
    await mcpServer.start();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  if (args[0] === '--status') {
    const backend = createNoopBackend();
    const adapter = createCliAdapter(backend);
    const config: MiddlewareConfig = DEFAULT_CONFIG;
    initializeDegradation(backend, config);
    startStatusDisplay();

    log.info('status_display_started', {
      refresh_ms: STATUS_REFRESH_MS,
    });

    void adapter;
    return;
  }

  if (args[0] === 'start') {
    await startServer();
    return;
  }

  printUsage();
  process.exit(1);
}

export async function shutdown(): Promise<void> {
  if (activeMcpServer) {
    try {
      await activeMcpServer.close();
    } catch (err: unknown) {
      log.error('mcp_server_close_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    activeMcpServer = null;
  }

  if (activeBackend && 'disconnect' in activeBackend && typeof (activeBackend as MemtraceTransport).disconnect === 'function') {
    try {
      await (activeBackend as MemtraceTransport).disconnect();
    } catch (err: unknown) {
      log.error('backend_disconnect_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  activeBackend = null;

  shutdownDegradation();
}

const isMainModule = typeof import.meta !== 'undefined' &&
  import.meta.url === new URL(process.argv[1] ?? '', 'file://').href;
if (isMainModule) {
  (async () => {
    try {
      process.on('SIGINT', async () => {
        try {
          await shutdown();
        } catch {
          // best-effort cleanup on signal
        }
        process.exit(0);
      });
      process.on('SIGTERM', async () => {
        try {
          await shutdown();
        } catch {
          // best-effort cleanup on signal
        }
        process.exit(0);
      });
      await main();
    } catch (err: unknown) {
      log.error('cli_fatal', { error: err instanceof Error ? err.message : String(err) });
      process.exit(1);
    }
  })();
}
