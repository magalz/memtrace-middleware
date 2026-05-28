import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  CallToolResultSchema,
  ListToolsResultSchema,
  ToolListChangedNotificationSchema,
} from '@modelcontextprotocol/sdk/types.js';
import crypto from 'node:crypto';

import { loadConfig, type MiddlewareConfig } from '../config/index.js';
import { MiddlewareError } from '../errors.js';
import { createLogger } from '../logger.js';
import type { GraphQuery, QueryResult, ToolSchema } from '../types.js';
import { ToolCatalog } from './tool-catalog.js';
import type { MemtraceBackend } from './trait.js';

const logger = createLogger('backend');

const BACKOFF_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PROBE_TIMEOUT_MS = 5000;

export class MemtraceTransport implements MemtraceBackend {
  private client: Client | null = null;
  private transportInstance: StreamableHTTPClientTransport | null = null;
  private toolCatalog: ToolCatalog;
  private disconnectRequested = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private url: URL | null = null;
  private retryAttempt = 0;
  private customUrl: string | undefined;
  private connecting = false;

  constructor(customUrl?: string) {
    this.toolCatalog = new ToolCatalog();
    this.customUrl = customUrl;
  }

  async connect(): Promise<void> {
    const config = this.customUrl
      ? ({ memtrace_host: this.customUrl, memtrace_token: '' } as MiddlewareConfig)
      : loadConfig();
    this.url = new URL(config.memtrace_host);
    await this.establishConnection(config);
  }

  private async establishConnection(config: MiddlewareConfig): Promise<void> {
    this.disconnectRequested = false;
    this.connecting = true;

    if (this.client) {
      await this.disconnect();
    }

    const client = new Client(
      { name: 'memtrace-middleware', version: '0.1.0' },
      { capabilities: {} }
    );

    const mcpTransport = new StreamableHTTPClientTransport(
      this.url!,
      config.memtrace_token
        ? { requestInit: { headers: { Authorization: `Bearer ${config.memtrace_token}` } } }
        : undefined
    );

    const closeHandler = () => {
      if (!this.disconnectRequested && !this.connecting) {
        logger.warn('Memtrace MCP connection closed, reconnecting...');
        this.scheduleReconnect();
      }
    };

    mcpTransport.onclose = closeHandler;

    mcpTransport.onerror = (error) => {
      logger.error('Memtrace MCP transport error', { error: String(error) });
      if (!this.disconnectRequested && !this.connecting) {
        this.scheduleReconnect();
      }
    };

    this.client = client;
    this.transportInstance = mcpTransport;

    try {
      await client.connect(mcpTransport);
    } catch {
      this.client = null;
      this.transportInstance = null;
      this.connecting = false;
      throw new MiddlewareError({
        cause: 'memtrace_unavailable',
        recoverable: true,
        suggested_action: 'retry_connection',
      });
    }

    this.retryAttempt = 0;
    this.connecting = false;

    logger.info('connected', { host: config.memtrace_host });

    try {
      const tools = await this.listTools();
      this.toolCatalog.refresh(tools);
    } catch {
      await this.disconnect();
      throw new MiddlewareError({
        cause: 'memtrace_unavailable',
        recoverable: true,
        suggested_action: 'retry_connection',
      });
    }

    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      try {
        const tools = await this.listTools();
        this.toolCatalog.refresh(tools);
        logger.info('tool catalog refreshed after list_changed notification');
      } catch {
        logger.warn('failed to refresh tool catalog after list_changed');
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.disconnectRequested) return;
    if (this.retryTimer) return;

    const delay = BACKOFF_DELAYS[Math.min(this.retryAttempt, BACKOFF_DELAYS.length - 1)];
    this.retryAttempt++;

    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.disconnectRequested) return;

      logger.warn('reconnecting to Memtrace MCP...');
      try {
        const config = this.customUrl
          ? ({ memtrace_host: this.customUrl, memtrace_token: '' } as MiddlewareConfig)
          : loadConfig();
        await this.establishConnection(config);
        logger.info('reconnection successful');
      } catch {
        logger.warn('reconnection failed, retrying...');
        this.scheduleReconnect();
      }
    }, delay);
  }

  async execute(query: GraphQuery, signal: AbortSignal): Promise<QueryResult> {
    if (!this.client) {
      throw new MiddlewareError({
        cause: 'memtrace_unavailable',
        recoverable: true,
        suggested_action: 'connect_first',
      });
    }

    const traceId = `${query.tool.slice(0, 2)}-${crypto.randomUUID().slice(0, 8)}`;
    const startTime = Date.now();

    logger.info('query_start', {
      trace_id: traceId,
      tool: query.tool,
      args_hash: this.hashArgs(query.arguments),
    });

    try {
      const result = await this.client.request(
        {
          method: 'tools/call',
          params: { name: query.tool, arguments: query.arguments },
        },
        CallToolResultSchema,
        { signal }
      );

      const elapsedMs = Date.now() - startTime;

      logger.info('query_end', {
        trace_id: traceId,
        tool: query.tool,
        elapsed_ms: elapsedMs,
        success: true,
      });

      return {
        tool: query.tool,
        data: result.content,
        trace_id: traceId,
        elapsed_ms: elapsedMs,
        degraded: false,
      };
    } catch (err) {
      const elapsedMs = Date.now() - startTime;

      if (signal.aborted) {
        logger.info('query_end', {
          trace_id: traceId,
          tool: query.tool,
          elapsed_ms: elapsedMs,
          success: false,
          error: 'aborted',
        });

        return {
          tool: query.tool,
          data: null,
          trace_id: traceId,
          elapsed_ms: elapsedMs,
          degraded: true,
        };
      }

      logger.info('query_end', {
        trace_id: traceId,
        tool: query.tool,
        elapsed_ms: elapsedMs,
        success: false,
        error: String(err),
      });

      throw new MiddlewareError({
        cause: 'query_execution_failed',
        recoverable: true,
        suggested_action: 'retry_query',
      });
    }
  }

  async probe(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

      try {
        await this.client.request({ method: 'tools/list', params: {} }, ListToolsResultSchema, {
          signal: controller.signal,
        });

        return true;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return false;
    }
  }

  async listTools(): Promise<ToolSchema[]> {
    if (!this.client) {
      throw new MiddlewareError({
        cause: 'memtrace_unavailable',
        recoverable: true,
        suggested_action: 'connect_first',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    try {
      const result = await this.client.request(
        { method: 'tools/list', params: {} },
        ListToolsResultSchema,
        { signal: controller.signal }
      );

      return (result.tools ?? []) as ToolSchema[];
    } finally {
      clearTimeout(timer);
    }
  }

  getCatalog(): ToolCatalog {
    return this.toolCatalog;
  }

  async disconnect(): Promise<void> {
    this.disconnectRequested = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.transportInstance) {
      try {
        await this.transportInstance.close();
      } finally {
        this.transportInstance = null;
      }
    }
    this.client = null;
  }

  private hashArgs(args: Record<string, unknown>): string {
    const keys = Object.keys(args ?? {}).sort();
    const sorted: Record<string, unknown> = {};
    for (const k of keys) {
      sorted[k] = (args ?? {})[k];
    }
    return crypto.createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 8);
  }
}
