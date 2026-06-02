#!/usr/bin/env node

import { existsSync } from 'node:fs';

import { createCliAdapter } from '../adapters/index.js';
import { createNoopBackend } from '../backend/index.js';
import type { MemtraceBackend } from '../backend/trait.js';
import { MemtraceTransport } from '../backend/transport.js';
import {
  DEFAULT_CONFIG,
  getConfigPath,
  discoverEnvironment,
  readWorkspaceConfig,
  writeConfig,
} from '../config/index.js';
import type { MiddlewareConfig } from '../config/types.js';
import { MIDDLEWARE_VERSION, STATUS_REFRESH_MS } from '../constants.js';
import { initializeDegradation, shutdownDegradation } from '../degrade/index.js';
import { createLogger } from '../logger.js';
import { createDegradedMcpServer, createMcpServer, type McpServerInstance } from './mcp-server.js';
import { startStatusDisplay } from './status.js';

const log = createLogger('cli');

let activeMcpServer: McpServerInstance | null = null;
let activeBackend: MemtraceBackend | null = null;

function printUsage(): void {
  process.stderr.write('usage: memtrace --status | init [--force] | start\n');
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

    if (activeBackend) {
      try {
        await activeBackend.disconnect?.();
      } catch {
        // best-effort cleanup
      }
    }
    shutdownDegradation();

    process.stderr.write(`Warning: Memtrace backend unavailable — starting in degraded mode\n`);

    const noop = createNoopBackend();
    activeBackend = noop;
    initializeDegradation(noop, config);
    const mcpServer = createDegradedMcpServer();
    activeMcpServer = mcpServer;

    process.stderr.write(`memtrace-middleware v${MIDDLEWARE_VERSION} — degraded mode\n`);
    await mcpServer.start();
  }
}

export async function runInit(force: boolean): Promise<void> {
  const configPath = getConfigPath();

  if (!force && existsSync(configPath)) {
    process.stderr.write(`Configuration already exists at ${configPath}\n`);
    process.stderr.write('Use --force to overwrite.\n');
    return;
  }

  const { sync } = discoverEnvironment();

  let host =
    sync.memtrace_indexed && sync.workspace_anchor
      ? (readWorkspaceConfig(sync.workspace_anchor)?.host as string | undefined)
      : undefined;
  host = host ?? process.env['MEMTRACE_HOST'] ?? 'http://localhost:8080';

  let reachable = false;
  try {
    const resp = await fetch(`${host}/health`, { signal: AbortSignal.timeout(3000) });
    reachable = resp.ok;
  } catch {
    reachable = false;
  }

  const token = process.env['MEMTRACE_MCP_TOKEN'] ?? '';

  const config: MiddlewareConfig = {
    ...DEFAULT_CONFIG,
    memtrace_host: host,
    memtrace_token: token,
  };

  process.stderr.write('mtm init — Memtrace Middleware auto-detection\n');
  process.stderr.write(`  project_root:      ${sync.project_root}\n`);
  process.stderr.write(`  is_git_repo:       ${sync.is_git_repo}\n`);
  process.stderr.write(`  memtrace_indexed:  ${sync.memtrace_indexed}\n`);
  if (sync.workspace_anchor)
    process.stderr.write(`  workspace_anchor:  ${sync.workspace_anchor}\n`);
  process.stderr.write(`  memtrace_host:     ${host}\n`);
  process.stderr.write(`  memtrace_token:    ${token ? '<present>' : '<not set>'}\n\n`);

  writeConfig(config, configPath);

  if (sync.memtrace_indexed && reachable) {
    process.stderr.write('✅ Memtrace indexed and reachable — ready.\n');
  } else if (sync.memtrace_indexed) {
    process.stderr.write(
      '⚠️  Memtrace indexed but unreachable. Run `mtm start` when Memtrace server is running.\n'
    );
  } else {
    process.stderr.write(
      '⚠️  No Memtrace index detected. Run `memtrace` to index this project first.\n'
    );
  }
  process.stderr.write('Next: run `mtm start` to begin intercepting agent tool calls.\n');
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

  if (args[0] === 'init') {
    const forceOverwrite = args.includes('--force');
    await runInit(forceOverwrite);
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

  if (activeBackend) {
    try {
      await activeBackend.disconnect?.();
    } catch (err: unknown) {
      log.error('backend_disconnect_error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  activeBackend = null;

  shutdownDegradation();
}

const isMainModule =
  typeof import.meta !== 'undefined' &&
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
