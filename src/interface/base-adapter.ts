import crypto from 'node:crypto';

import type { MemtraceBackend } from '../backend/trait.js';
import type { MiddlewareConfig } from '../config/index.js';
import { MAX_DISPATCH_TIMEOUT_MS, MAX_SUB_QUERY_TIMEOUT_MS } from '../constants.js';
import { MiddlewareError } from '../errors.js';
import { fuse, validateContext } from '../fusion/index.js';
import { createLogger } from '../logger.js';
import { classify, plan } from '../router/index.js';
import { metrics } from '../telemetry/index.js';
import {
  DegradationTier,
  type FusedContext,
  type GraphQuery,
  type MemtraceCapabilities,
  type QueryResult,
} from '../types.js';
import { type DispatchContext, cleanupContext, createDispatchContext } from './dispatch-context.js';
import type { AgentResponse, ContextBuilder, ToolProvider } from './traits.js';
import { validateToolCall } from './validate.js';

const log = createLogger('interface');

function buildDefaultContext(context: FusedContext): AgentResponse {
  const textBlocks = context.blocks.map(
    (b) =>
      `[memtrace: grounded via ${b.query_type} → ${b.symbol} at ${b.file_path}:${b.start_line}]`
  );
  return {
    content: [{ type: 'text', text: textBlocks.join('\n') || 'no results' }],
    metadata: {
      tier: context.partial ? DegradationTier.IntentReduced : DegradationTier.Full,
      trace_id: context.trace_id,
      elapsed_ms: 0,
    },
  };
}

const defaultContextBuilder: ContextBuilder = {
  buildContext: buildDefaultContext,
};

export class BaseAdapter implements ToolProvider {
  private readonly backend: MemtraceBackend;
  private readonly config: MiddlewareConfig;
  private readonly contextBuilder: ContextBuilder;
  private readonly sessions: Map<string, { id: string; created_at: string; intent_count: number }> =
    new Map();

  constructor(backend: MemtraceBackend, config?: MiddlewareConfig) {
    this.backend = backend;
    this.config = config ?? {
      memtrace_host: '',
      memtrace_token: '',
      timeout_budgets: {
        sub_query_ms: MAX_SUB_QUERY_TIMEOUT_MS,
        dispatch_ms: MAX_DISPATCH_TIMEOUT_MS,
        probe_interval_ms: 15000,
      },
      hysteresis_probe_count: 3,
      degradation_floor: 'Passthrough',
      enabled_intents: ['find_code', 'get_symbol_context', 'get_impact'],
      classification_threshold: 0.95,
    };
    this.contextBuilder = defaultContextBuilder;
  }

  async dispatch(message: Record<string, unknown>): Promise<AgentResponse> {
    const traceId = `if-${crypto.randomUUID().slice(0, 8)}`;
    const ctx = createDispatchContext(traceId);
    const dispatchTimeout = this.config.timeout_budgets.dispatch_ms;

    try {
      const result = await Promise.race([
        this.runDispatch(message, traceId, ctx),
        new Promise<AgentResponse>((_, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new MiddlewareError({
                  cause: 'intent_timeout',
                  recoverable: true,
                  suggested_action: 'retry_with_smaller_scope',
                })
              ),
            dispatchTimeout
          );
          ctx.activeTimers.add(timer);
        }),
      ]);
      return result;
    } catch (err: unknown) {
      if (err instanceof MiddlewareError && err.cause === 'intent_timeout') {
        log.warn('dispatch_timeout', { trace_id: traceId, timeout_ms: dispatchTimeout });
        return {
          content: [{ type: 'text', text: JSON.stringify(err.toShape()) }],
          metadata: {
            tier: err.tier,
            trace_id: err.trace_id,
            elapsed_ms: Date.now() - ctx.dispatchStart,
          },
        };
      }
      const mwErr =
        err instanceof MiddlewareError
          ? err
          : new MiddlewareError({
              cause: 'query_execution_failed',
              recoverable: true,
              suggested_action: 'retry_dispatch',
            });
      return {
        content: [{ type: 'text', text: JSON.stringify(mwErr.toShape()) }],
        metadata: {
          tier: mwErr.tier,
          trace_id: mwErr.trace_id,
          elapsed_ms: Date.now() - ctx.dispatchStart,
        },
      };
    } finally {
      cleanupContext(ctx);
    }
  }

  private async runDispatch(
    message: Record<string, unknown>,
    traceId: string,
    ctx: DispatchContext
  ): Promise<AgentResponse> {
    const dispatchStart = ctx.dispatchStart;

    const validated = validateToolCall(message);
    if (!validated.ok) {
      return {
        content: [{ type: 'text', text: JSON.stringify(validated.error) }],
        metadata: {
          tier: validated.error.tier,
          trace_id: validated.error.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    let capabilities: MemtraceCapabilities;
    try {
      const tools = await this.backend.listTools();
      capabilities = { tools };
    } catch (err: unknown) {
      const originalMessage = err instanceof Error ? err.message : String(err);
      const mwErr =
        err instanceof MiddlewareError
          ? err
          : new MiddlewareError({
              cause: 'memtrace_unavailable',
              recoverable: true,
              suggested_action: 'retry_connection',
            });
      log.error('capabilities_fetch_failed', {
        trace_id: traceId,
        error: mwErr.message,
        original_error: originalMessage,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(mwErr.toShape()) }],
        metadata: {
          tier: mwErr.tier,
          trace_id: mwErr.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    const classified = classify(
      validated.value as unknown as Record<string, unknown>,
      capabilities
    );
    if (!classified.ok) {
      log.warn('classification_failed', { trace_id: traceId, error: classified.error });
      return {
        content: [{ type: 'text', text: JSON.stringify(classified.error) }],
        metadata: {
          tier: classified.error.tier,
          trace_id: classified.error.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    const intent = classified.value;

    const planned = plan(intent, capabilities);
    if (!planned.ok) {
      log.warn('planning_failed', { trace_id: traceId, error: planned.error });
      return {
        content: [{ type: 'text', text: JSON.stringify(planned.error) }],
        metadata: {
          tier: planned.error.tier,
          trace_id: planned.error.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    const queries = planned.value;
    const subQueryTimeout = this.config.timeout_budgets.sub_query_ms;

    if (queries.length === 0) {
      log.warn('empty_query_plan', { trace_id: traceId, intent_type: intent.intent_type });
      const fusedContext: FusedContext = {
        blocks: [],
        partial: true,
        trace_id: traceId,
        provenance: [],
      };
      const response = this.contextBuilder.buildContext(fusedContext);
      response.metadata = {
        tier: DegradationTier.IntentReduced,
        trace_id: traceId,
        elapsed_ms: Date.now() - dispatchStart,
      };
      return response;
    }

    const results = await Promise.allSettled(
      queries.map((q: GraphQuery) => {
        const controller = new AbortController();
        ctx.activeControllers.add(controller);
        const timer = setTimeout(() => controller.abort(), subQueryTimeout);
        ctx.activeTimers.add(timer);
        return this.backend.execute(q, controller.signal).finally(() => {
          clearTimeout(timer);
          ctx.activeTimers.delete(timer);
          ctx.activeControllers.delete(controller);
        });
      })
    );

    const queryResults: QueryResult[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled') {
        queryResults.push(r.value);
        if (r.value.degraded) ctx.hasDegraded = true;
      } else {
        ctx.hasDegraded = true;
        const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
        const reasonTrace = r.reason instanceof MiddlewareError ? r.reason.trace_id : undefined;
        ctx.errors.push(reason);
        log.warn('query_rejected', {
          trace_id: traceId,
          error: reason,
          error_trace_id: reasonTrace,
        });
      }
    }

    const fusedResult = fuse({
      results: queryResults,
      intent_type: intent.intent_type,
    });

    if (!fusedResult.ok) {
      log.warn('fusion_failed', {
        trace_id: traceId,
        error: fusedResult.error,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(fusedResult.error) }],
        metadata: {
          tier: fusedResult.error.tier,
          trace_id: fusedResult.error.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    const fusedContext = fusedResult.value;
    fusedContext.trace_id = traceId;
    if (ctx.hasDegraded || intent.passthrough) {
      fusedContext.partial = true;
    }

    const fusionValidated = validateContext(fusedContext);
    if (!fusionValidated.ok) {
      log.warn('fusion_validation_failed', {
        trace_id: traceId,
        error: fusionValidated.error,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(fusionValidated.error) }],
        metadata: {
          tier: fusionValidated.error.tier,
          trace_id: fusionValidated.error.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    const elapsed = Date.now() - dispatchStart;
    const response = this.contextBuilder.buildContext(fusedContext);
    response.metadata = {
      ...(response.metadata ?? ({} as NonNullable<AgentResponse['metadata']>)),
      elapsed_ms: elapsed,
    };

    log.info('dispatch_complete', {
      trace_id: traceId,
      intent_type: intent.intent_type,
      query_count: queries.length,
      block_count: fusedContext.blocks.length,
      partial: fusedContext.partial,
      rejected_count: ctx.errors.length,
      elapsed_ms: elapsed,
    });

    metrics.recordDispatch(true, intent.intent_type, intent.confidence, elapsed);

    return response;
  }

  createSession(): string {
    const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessions.set(id, { id, created_at: new Date().toISOString(), intent_count: 0 });
    return id;
  }

  destroySession(id: string): void {
    this.sessions.delete(id);
  }

  getSession(id: string): { id: string; created_at: string; intent_count: number } | undefined {
    return this.sessions.get(id);
  }
}
