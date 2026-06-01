import { type DispatchContext, cleanupContext, createDispatchContext } from './dispatch-context.js';
import type { MemtraceBackend } from '../backend/trait.js';
import type { MiddlewareConfig } from '../config/index.js';
import { MAX_DISPATCH_TIMEOUT_MS, MAX_SUB_QUERY_TIMEOUT_MS } from '../constants.js';
import { degradationMachine } from '../degrade/index.js';
import { MiddlewareError } from '../errors.js';
import { fuse, validateContext } from '../fusion/index.js';
import { createLogger } from '../logger.js';
import type { AgentResponse, ContextBuilder, ToolProvider } from './traits.js';
import { classify, plan } from '../router/index.js';
import { coldStartRecordDispatch, isColdStart } from '../telemetry/cold-start.js';
import { metrics } from '../telemetry/index.js';
import { createTraceContext } from '../telemetry/tracer.js';
import type { TraceContext } from '../telemetry/tracer.js';
import {
  DegradationTier,
  type FusedContext,
  type GraphQuery,
  type MemtraceCapabilities,
  type QueryResult,
} from '../types.js';
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
    const trace = createTraceContext('interface');
    const traceId = trace.trace_id;
    const ctx = createDispatchContext(traceId);
    const dispatchTimeout = this.config.timeout_budgets.dispatch_ms;

    try {
      const result = await Promise.race([
        this.runDispatch(message, trace, ctx),
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
    trace: TraceContext,
    ctx: DispatchContext
  ): Promise<AgentResponse> {
    const traceId = trace.trace_id;
    const dispatchStart = ctx.dispatchStart;

    const tierAtEntry = degradationMachine.getCurrentTier();

    if (tierAtEntry === DegradationTier.FailClosed) {
      const error = new MiddlewareError({
        cause: 'memtrace_unavailable',
        recoverable: false,
        suggested_action: 'run_memtrace_start',
        tier: DegradationTier.FailClosed,
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(error.toShape()) }],
        metadata: {
          tier: DegradationTier.FailClosed,
          trace_id: error.trace_id,
          elapsed_ms: Date.now() - dispatchStart,
        },
      };
    }

    if (tierAtEntry === DegradationTier.Passthrough) {
      const classified = classify(message as unknown as Record<string, unknown>, { tools: [] });
      const intentType = classified.ok ? classified.value.intent_type : 'unknown';

      const msg = message as Record<string, unknown>;
      const params = (msg.params ?? {}) as Record<string, unknown>;
      const toolName = (params.name as string) ?? 'memtrace_find_code';
      const toolArgs = (params.arguments as Record<string, unknown>) ?? {};
      const query: GraphQuery = { tool: toolName, arguments: toolArgs };

      const controller = new AbortController();
      ctx.activeControllers.add(controller);
      const timer = setTimeout(() => controller.abort(), this.config.timeout_budgets.dispatch_ms);
      ctx.activeTimers.add(timer);

      try {
        const result = await this.backend.execute(query, controller.signal);
        const ptElapsed = Date.now() - dispatchStart;
        const startupType = isColdStart() ? 'cold' : 'warm';
        coldStartRecordDispatch(ptElapsed);
        metrics.recordDispatch(true, intentType, 1.0, ptElapsed, startupType);
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data) }],
          metadata: {
            tier: DegradationTier.Passthrough,
            trace_id: traceId,
            elapsed_ms: ptElapsed,
            passthrough: true,
            degradation_tier: DegradationTier.Passthrough,
            startup_type: startupType,
          },
        };
      } catch (err: unknown) {
        metrics.recordDispatch(
          false,
          intentType,
          0,
          Date.now() - dispatchStart,
          isColdStart() ? 'cold' : 'warm'
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(err instanceof Error ? err.message : String(err)),
            },
          ],
          metadata: {
            tier: DegradationTier.Passthrough,
            trace_id: traceId,
            elapsed_ms: Date.now() - dispatchStart,
            passthrough: true,
            degradation_tier: DegradationTier.Passthrough,
          },
        };
      } finally {
        clearTimeout(timer);
        ctx.activeTimers.delete(timer);
        ctx.activeControllers.delete(controller);
      }
    }

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
    log.info('phase_complete', {
      trace_id: traceId,
      phase: 'classify',
      elapsed_ms: Date.now() - dispatchStart,
    });

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
    log.info('phase_complete', {
      trace_id: traceId,
      phase: 'plan',
      elapsed_ms: Date.now() - dispatchStart,
    });

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

    const isIntentReduced = degradationMachine.getCurrentTier() === DegradationTier.IntentReduced;

    const results: PromiseSettledResult<QueryResult>[] = [];

    if (isIntentReduced) {
      for (const q of queries) {
        const controller = new AbortController();
        ctx.activeControllers.add(controller);
        const timer = setTimeout(() => controller.abort(), subQueryTimeout);
        ctx.activeTimers.add(timer);
        try {
          const value = await this.backend.execute(q as GraphQuery, controller.signal);
          results.push({ status: 'fulfilled', value });
        } catch (reason: unknown) {
          results.push({ status: 'rejected', reason });
        } finally {
          clearTimeout(timer);
          ctx.activeTimers.delete(timer);
          ctx.activeControllers.delete(controller);
        }
      }
    } else {
      const settled = await Promise.allSettled(
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
      results.push(...settled);
    }

    log.info('phase_complete', {
      trace_id: traceId,
      phase: 'execute',
      elapsed_ms: Date.now() - dispatchStart,
    });

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

    log.info('phase_complete', {
      trace_id: traceId,
      phase: 'fuse',
      elapsed_ms: Date.now() - dispatchStart,
    });

    let fusedContext = fusedResult.value;

    if (isIntentReduced) {
      fusedContext = {
        blocks: [],
        partial: true,
        trace_id: traceId,
        provenance: [],
      };
    }
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
    const currentTier = degradationMachine.getCurrentTier();
    const transitionReason = degradationMachine.getTransitionReason();
    let tierTransition:
      | { reason: string; from: DegradationTier; to: DegradationTier; timestamp: string }
      | undefined;
    if (transitionReason) {
      const transitionAge = Date.now() - new Date(transitionReason.timestamp).getTime();
      if (transitionAge < 30000) {
        tierTransition = transitionReason;
      }
    }

    const startupType = isColdStart() ? 'cold' : 'warm';
    coldStartRecordDispatch(elapsed);

    const response = this.contextBuilder.buildContext(fusedContext);
    response.metadata = {
      ...(response.metadata ?? ({} as NonNullable<AgentResponse['metadata']>)),
      elapsed_ms: elapsed,
      degradation_tier: currentTier,
      tier_transition: tierTransition,
      startup_type: startupType,
    };

    log.info('dispatch_complete', {
      trace_id: traceId,
      intent_type: intent.intent_type,
      query_count: queries.length,
      block_count: fusedContext.blocks.length,
      partial: fusedContext.partial,
      rejected_count: ctx.errors.length,
      elapsed_ms: elapsed,
      degradation_tier: degradationMachine.getCurrentTier(),
      startup_type: startupType,
    });

    metrics.recordDispatch(true, intent.intent_type, intent.confidence, elapsed, startupType);

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
