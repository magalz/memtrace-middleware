#!/usr/bin/env node

import { createCliAdapter } from '../adapters/index.js';
import type { MemtraceBackend } from '../backend/trait.js';
import { DEFAULT_CONFIG, type MiddlewareConfig } from '../config/types.js';
import { STATUS_REFRESH_MS } from '../constants.js';
import { initializeDegradation, shutdownDegradation } from '../degrade/index.js';
import { createLogger } from '../logger.js';
import type { QueryResult, ToolSchema, GraphQuery } from '../types.js';
import { startStatusDisplay } from './status.js';

const log = createLogger('cli');

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
  process.stderr.write('usage: memtrace --status | service\n');
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
    log.info('server_mode_placeholder');
    process.stderr.write('server mode not yet implemented\n');
    process.exit(1);
  }

  printUsage();
  process.exit(1);
}

(async () => {
  try {
    process.on('SIGINT', () => {
      shutdownDegradation();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      shutdownDegradation();
      process.exit(0);
    });
    await main();
  } catch (err: unknown) {
    log.error('cli_fatal', { error: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  }
})();
