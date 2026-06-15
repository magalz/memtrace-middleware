import { type DispatchContext, cleanupContext, createDispatchContext } from './dispatch-context.js';
import type { MemtraceBackend } from '../backend/trait.js';
import type { MiddlewareConfig } from '../config/index.js';
import {
  MAX_DISPATCH_TIMEOUT_MS,
  MAX_SUB_QUERY_TIMEOUT_MS,
  DEFAULT_PRUNING_THRESHOLD,
} from '../constants.js';
import { degradationMachine, getRateLimiter, getCircuitBreaker } from '../degrade/index.js';
import { MiddlewareError } from '../errors.js';
import { fuse, validateContext } from '../fusion/index.js';
import { createLogger } from '../logger.js';
import type { AgentResponse, ContextBuilder, ToolProvider } from './traits.js';
import { classify, plan, pruneHistory } from '../router/index.js';
import type { ConversationHistory } from '../router/index.js';
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
  private conversationHistory: ConversationHistory = [];

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
      rate_limiting: {
        enabled: true,
        max_requests_per_window: 100,
        window_ms: 60000,
        max_concurrent: 10,
      },
      circuit_breaker: {
        enabled: true,
        failure_threshold: 5,
        success_threshold: 3,
        half_open_max_calls: 3,
        open_state_ms: 30000,
      },
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
    let rateLimitSlotAcquired = false;

    const tierAtEntry = degradationMachine.getCurrentTier();

    try {
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

      const rl = getRateLimiter();
      if (rl) {
        if (!rl.acquireSlot()) {
          const error = new MiddlewareError({
            cause: 'rate_limited',
            recoverable: true,
            suggested_action: 'retry_with_backoff',
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(error.toShape()) }],
            metadata: {
              tier: tierAtEntry,
              trace_id: traceId,
              elapsed_ms: Date.now() - dispatchStart,
            },
          };
        }
        rateLimitSlotAcquired = true;
        const rateCheck = rl.checkRateLimit();
        if (!rateCheck.ok) {
          return {
            content: [{ type: 'text', text: JSON.stringify(rateCheck.error.toShape()) }],
            metadata: {
              tier: tierAtEntry,
              trace_id: traceId,
              elapsed_ms: Date.now() - dispatchStart,
            },
          };
        }
      }

      const cb = getCircuitBreaker();
      if (cb && !cb.allowRequest()) {
        const cbError = new MiddlewareError({
          cause: 'circuit_open',
          recoverable: true,
          suggested_action: 'wait_and_retry',
          tier: tierAtEntry,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(cbError.toShape()) }],
          metadata: {
            tier: tierAtEntry,
            trace_id: traceId,
            elapsed_ms: Date.now() - dispatchStart,
          },
        };
      }

      if (tierAtEntry === DegradationTier.Passthrough) {
        const prunedHistory = this.pruneConversationHistory(message as Record<string, unknown>);
        const classified = classify(
          message as unknown as Record<string, unknown>,
          { tools: [] },
          prunedHistory
        );
        const intentType = classified.ok ? classified.value.intent_type : 'unknown';

        const cb = getCircuitBreaker();
        if (cb && !cb.allowRequest()) {
          const cbError = new MiddlewareError({
            cause: 'circuit_open',
            recoverable: true,
            suggested_action: 'wait_and_retry',
          });
          return {
            content: [{ type: 'text', text: JSON.stringify(cbError.toShape()) }],
            metadata: {
              tier: DegradationTier.Passthrough,
              trace_id: traceId,
              elapsed_ms: Date.now() - dispatchStart,
              passthrough: true,
              degradation_tier: DegradationTier.Passthrough,
            },
          };
        }

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
          const turnSymbols = typeof toolName === 'string' && toolName.length > 0 ? [toolName] : [];
          this.conversationHistory.push({
            timestamp: new Date().toISOString(),
            message_text: JSON.stringify(msg),
            symbols: turnSymbols,
          });
          const maxCap = (this.config.pruning?.max_turn_threshold ?? DEFAULT_PRUNING_THRESHOLD) * 2;
          if (this.conversationHistory.length > maxCap) {
            this.conversationHistory = this.conversationHistory.slice(-maxCap);
          }
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

      const prunedHistory = this.pruneConversationHistory(
        validated.value as unknown as Record<string, unknown>
      );

      const classified = classify(
        validated.value as unknown as Record<string, unknown>,
        capabilities,
        prunedHistory
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
        const elapsed = Date.now() - dispatchStart;
        log.warn('empty_query_plan', { trace_id: traceId, intent_type: intent.intent_type });
        const clampedConfidence = Number.isFinite(intent.confidence)
          ? Math.max(0, Math.min(1, intent.confidence))
          : 0;
        const intentType = intent.intent_type ?? 'unknown';
        const fusedContext: FusedContext = {
          blocks: [],
          partial: true,
          trace_id: traceId,
          provenance: [],
        };
        const validatedEmpty = validateContext(fusedContext);
        if (!validatedEmpty.ok) {
          log.warn('empty_query_plan_validation_failed', {
            trace_id: traceId,
            error: validatedEmpty.error,
          });
        }
        const response = this.contextBuilder.buildContext(fusedContext);
        response.metadata = {
          ...(response.metadata ?? ({} as NonNullable<AgentResponse['metadata']>)),
          tier: DegradationTier.IntentReduced,
          trace_id: traceId,
          elapsed_ms: elapsed,
        };
        try {
          metrics.recordDispatch(true, intentType, clampedConfidence, elapsed);
        } catch (err: unknown) {
          log.warn('empty_query_plan_metrics_failed', {
            trace_id: traceId,
            intent_type: intentType,
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return response;
      }

      const isIntentReduced = degradationMachine.getCurrentTier() === DegradationTier.IntentReduced;

      const results: PromiseSettledResult<QueryResult>[] = [];

      if (isIntentReduced) {
        for (const q of queries) {
          const cb = getCircuitBreaker();
          if (cb && !cb.allowRequest()) {
            results.push({
              status: 'rejected',
              reason: new MiddlewareError({
                cause: 'circuit_open',
                recoverable: true,
                suggested_action: 'wait_and_retry',
              }),
            });
            continue;
          }

          const controller = new AbortController();
          ctx.activeControllers.add(controller);
          const timer = setTimeout(() => controller.abort(), subQueryTimeout);
          ctx.activeTimers.add(timer);
          try {
            const value = await this.backend.execute(q as GraphQuery, controller.signal);
            cb?.recordSuccess();
            results.push({ status: 'fulfilled', value });
          } catch (reason: unknown) {
            cb?.recordFailure();
            results.push({ status: 'rejected', reason });
          } finally {
            clearTimeout(timer);
            ctx.activeTimers.delete(timer);
            ctx.activeControllers.delete(controller);
          }
        }
      } else {
        const settled = await Promise.allSettled(
          queries.map(async (q: GraphQuery) => {
            const cb = getCircuitBreaker();
            if (cb && !cb.allowRequest()) {
              throw new MiddlewareError({
                cause: 'circuit_open',
                recoverable: true,
                suggested_action: 'wait_and_retry',
              });
            }

            const controller = new AbortController();
            ctx.activeControllers.add(controller);
            const timer = setTimeout(() => controller.abort(), subQueryTimeout);
            ctx.activeTimers.add(timer);
            try {
              const value = await this.backend.execute(q, controller.signal);
              cb?.recordSuccess();
              return value;
            } catch (reason: unknown) {
              cb?.recordFailure();
              throw reason;
            } finally {
              clearTimeout(timer);
              ctx.activeTimers.delete(timer);
              ctx.activeControllers.delete(controller);
            }
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
      let circuitOpenBlocked = false;

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
          if (r.reason instanceof MiddlewareError && r.reason.cause === 'circuit_open') {
            circuitOpenBlocked = true;
          }
        }
      }

      if (circuitOpenBlocked && queryResults.length === 0) {
        const cbError = new MiddlewareError({
          cause: 'circuit_open',
          recoverable: true,
          suggested_action: 'wait_and_retry',
          tier: degradationMachine.getCurrentTier(),
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(cbError.toShape()) }],
          metadata: {
            tier: cbError.tier,
            trace_id: cbError.trace_id,
            elapsed_ms: Date.now() - dispatchStart,
          },
        };
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

      const turnSymbols = fusedContext.blocks.map((b) => b.symbol);
      this.conversationHistory.push({
        timestamp: new Date().toISOString(),
        message_text: JSON.stringify(message),
        symbols: turnSymbols,
      });
      const maxCapHist = (this.config.pruning?.max_turn_threshold ?? DEFAULT_PRUNING_THRESHOLD) * 2;
      if (this.conversationHistory.length > maxCapHist) {
        this.conversationHistory = this.conversationHistory.slice(-maxCapHist);
      }

      return response;
    } finally {
      if (rateLimitSlotAcquired) {
        getRateLimiter()?.releaseSlot();
      }
    }
  }

  private pruneConversationHistory(message: Record<string, unknown>): ConversationHistory {
    const pruningCfg = this.config.pruning;
    if (!pruningCfg?.enabled || this.conversationHistory.length <= pruningCfg.max_turn_threshold) {
      return this.conversationHistory;
    }
    const pruneResult = pruneHistory(this.conversationHistory, message, pruningCfg);
    metrics.recordPruning(pruneResult.stats);
    this.conversationHistory = pruneResult.pruned;
    return pruneResult.pruned;
  }

  createSession(): string {
    const id = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.sessions.set(id, { id, created_at: new Date().toISOString(), intent_count: 0 });
    return id;
  }

  destroySession(id: string): void {
    this.sessions.delete(id);
    this.conversationHistory = [];
  }

  getSession(id: string): { id: string; created_at: string; intent_count: number } | undefined {
    return this.sessions.get(id);
  }
}
