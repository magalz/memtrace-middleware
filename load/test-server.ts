import http from 'node:http';

import type { MemtraceBackend } from '../src/backend/trait.js';
import { MemtraceTransport } from '../src/backend/transport.js';
import { loadConfig } from '../src/config/index.js';
import { DEFAULT_CONFIG, type MiddlewareConfig } from '../src/config/types.js';
import {
  initializeDegradation,
  shutdownDegradation,
} from '../src/degrade/index.js';
import { degradationMachine } from '../src/degrade/machine.js';
import { createLogger } from '../src/logger.js';
import { metrics } from '../src/telemetry/metrics.js';
import { DegradationTier } from '../src/types.js';

const log = createLogger('test-server');

const DEFAULT_TEST_PORT = 3000;
const INTENT_REGISTRY = [
  { name: 'find_code', tool: 'memtrace_find_code', args: { query: 'auth', file_path: 'src/' } },
  { name: 'get_symbol_context', tool: 'memtrace_get_symbol_context', args: { symbol: 'validateToken', repo_id: 'my-repo' } },
  { name: 'get_impact', tool: 'memtrace_get_impact', args: { target: 'validateToken', repo_id: 'my-repo' } },
  { name: 'review_code', tool: 'memtrace_find_ast_review_issues', args: { diff: '', repo_root: '.' } },
  { name: 'get_style_fingerprint', tool: 'get_style_fingerprint', args: { repo_id: 'my-repo' } },
  { name: 'find_dead_code', tool: 'memtrace_find_dead_code', args: { repo_id: 'my-repo' } },
  { name: 'get_evolution', tool: 'memtrace_get_evolution', args: { repo_id: 'my-repo', from: '7d ago' } },
  { name: 'get_process_flow', tool: 'memtrace_get_process_flow', args: { process: 'login', repo_id: 'my-repo' } },
  { name: 'get_api_topology', tool: 'memtrace_get_api_topology', args: {} },
  { name: 'find_bridge_symbols', tool: 'memtrace_find_bridge_symbols', args: { repo_id: 'my-repo' } },
  { name: 'find_central_symbols', tool: 'memtrace_find_central_symbols', args: { repo_id: 'my-repo' } },
  { name: 'find_dependency_path', tool: 'memtrace_find_dependency_path', args: { source: 'login', target: 'db', repo_id: 'my-repo' } },
];

function getRandomIntent(): { name: string; tool: string; args: Record<string, unknown> } {
  return INTENT_REGISTRY[Math.floor(Math.random() * INTENT_REGISTRY.length)]!;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function errorResponse(res: http.ServerResponse, status: number, message: string): void {
  jsonResponse(res, status, { error: message });
}

export interface TestServerHandle {
  server: http.Server;
  port: number;
}

export async function startTestServer(
  config?: Partial<MiddlewareConfig>,
  backendOverride?: MemtraceBackend
): Promise<TestServerHandle> {
  const envPort = process.env['MEMTRACE_TEST_PORT'];
  const port = envPort ? parseInt(envPort, 10) : DEFAULT_TEST_PORT;

  const transport = backendOverride ?? new MemtraceTransport();
  let backendConnected = false;

  if (backendOverride) {
    backendConnected = true;
    const mergedConfig: MiddlewareConfig = { ...DEFAULT_CONFIG, ...config };
    initializeDegradation(transport, mergedConfig);
    log.info('backend_override_used');
  } else if (transport instanceof MemtraceTransport) {
    try {
      const loadedConfig = loadConfig();
      await transport.connect();
      backendConnected = true;
      const mergedConfig: MiddlewareConfig = { ...DEFAULT_CONFIG, ...loadedConfig, ...config };
      initializeDegradation(transport, mergedConfig);
      log.info('backend_connected_and_degradation_started');
    } catch (err: unknown) {
      log.warn('backend_connection_failed', {
        error: err instanceof Error ? err.message : String(err),
        note: 'test server running without backend — simulate endpoints will work, dispatch will fail',
      });
    }
  }

  const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    try {
      if (method === 'POST' && url === '/dispatch') {
        const body = await readBody(req);
        let toolCall: { tool_call?: string; args?: Record<string, unknown>; startup?: string } | null;
        try {
          const parsed = JSON.parse(body);
          if (parsed === null || typeof parsed !== 'object') {
            errorResponse(res, 400, 'JSON body must be an object');
            return;
          }
          toolCall = parsed as { tool_call?: string; args?: Record<string, unknown>; startup?: string };
        } catch {
          errorResponse(res, 400, 'invalid JSON body');
          return;
        }

        const toolName = toolCall.tool_call ?? 'memtrace_find_code';
        const toolArgs = toolCall.args ?? {};

        if (!backendConnected) {
          errorResponse(res, 503, 'backend not connected');
          return;
        }

        const isColdStart = toolCall.startup === 'cold';
        const startTime = Date.now();
        try {
          const query = { tool: toolName, arguments: toolArgs };
          const signal = AbortSignal.timeout(200);
          const result = await transport.execute(query, signal);
          const elapsedMs = Date.now() - startTime;
          metrics.recordDispatch(true, toolName, 1.0, elapsedMs, isColdStart ? 'cold' : 'warm');
          jsonResponse(res, 200, {
            trace_id: result.trace_id,
            elapsed_ms: elapsedMs,
            data: result.data,
            degraded: result.degraded,
            blocks: result.data ?? [],
            partial: result.degraded,
          });
        } catch (err: unknown) {
          const elapsedMs = Date.now() - startTime;
          metrics.recordDispatch(false, toolName, 0, elapsedMs);
          log.warn('dispatch_failed', {
            tool: toolName,
            error: err instanceof Error ? err.message : String(err),
          });
          errorResponse(res, 500, err instanceof Error ? err.message : String(err));
        }
        return;
      }

      if (method === 'POST' && url === '/simulate/memtrace-down') {
        try {
          if (transport.disconnect) {
            await transport.disconnect();
          } else if (transport instanceof MemtraceTransport) {
            await transport.disconnect();
          }
          backendConnected = false;
          log.info('memtrace_disconnected_simulated');
          jsonResponse(res, 200, { status: 'memtrace_disconnected', tier: degradationMachine.getCurrentTier() });
        } catch (err: unknown) {
          log.error('disconnect_failed', { error: String(err) });
          errorResponse(res, 500, 'failed to disconnect');
        }
        return;
      }

      if (method === 'POST' && url === '/simulate/memtrace-up') {
        if (backendConnected) {
          jsonResponse(res, 200, { status: 'already_connected', tier: degradationMachine.getCurrentTier() });
          return;
        }
        try {
          if (transport instanceof MemtraceTransport) {
            await transport.connect();
          }
          backendConnected = true;
          log.info('memtrace_reconnected_simulated');
          jsonResponse(res, 200, { status: 'memtrace_reconnected', tier: degradationMachine.getCurrentTier() });
        } catch (err: unknown) {
          log.error('reconnect_failed', { error: String(err) });
          errorResponse(res, 500, 'failed to reconnect');
        }
        return;
      }

      if (method === 'GET' && url === '/status') {
        const snapshot = metrics.getSnapshot();
        jsonResponse(res, 200, {
          tier: degradationMachine.getCurrentTier(),
          degradation_tier: degradationMachine.getCurrentTier(),
          tier_history: degradationMachine.getTierHistory(),
          transition_reason: degradationMachine.getTransitionReason(),
          query_stats: {
            success: snapshot.query_success,
            failure: snapshot.query_failure,
          },
          uptime_seconds: snapshot.uptime_seconds,
          active_intents: snapshot.active_intents,
          latency_stats: snapshot.latency_stats,
          cold_start: snapshot.cold_start,
        });
        return;
      }

      errorResponse(res, 404, `not found: ${method} ${url}`);
    } catch (err: unknown) {
      log.error('request_handler_error', {
        method,
        url,
        error: err instanceof Error ? err.message : String(err),
      });
      errorResponse(res, 500, 'internal server error');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      log.info('test_server_started', { port: actualPort });
      resolve({ server, port: actualPort });
    });
    server.on('error', (err) => {
      log.error('test_server_error', { error: String(err) });
      reject(err);
    });
  });
}

export async function stopTestServer(handle: TestServerHandle): Promise<void> {
  return new Promise((resolve) => {
    handle.server.close(() => {
      shutdownDegradation();
      log.info('test_server_stopped');
      resolve();
    });
  });
}

async function main(): Promise<void> {
  if (!process.env['MEMTRACE_TEST_MODE']) {
    log.error('test_mode_not_set', { note: 'set MEMTRACE_TEST_MODE=1 to start test server' });
    process.exit(1);
  }

  const handle = await startTestServer();
  log.info('test_server_ready', { port: handle.port });

  process.on('SIGINT', async () => {
    await stopTestServer(handle);
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await stopTestServer(handle);
    process.exit(0);
  });
}

const isMainModule =
  typeof import.meta !== 'undefined' &&
  import.meta.url === new URL(process.argv[1] ?? '', 'file://').href;
if (isMainModule) {
  main().catch((err: unknown) => {
    log.error('test_server_fatal', { error: String(err) });
    process.exit(1);
  });
}
