import { createLogger } from '../logger.js';
import type { ClassifiedIntent, GraphQuery, MemtraceCapabilities, Result } from '../types.js';
import { getRegistry } from './classify.js';

const logger = createLogger('router');

const ARG_KEY_BY_TOOL: Record<string, string> = {
  memtrace_find_code: 'query',
  memtrace_get_symbol_context: 'symbol',
  memtrace_get_impact: 'target',
  find_ast_review_issues: 'query',
  get_style_fingerprint: 'query',
};

export function plan(
  intent: ClassifiedIntent,
  capabilities: MemtraceCapabilities
): Result<GraphQuery[]> {
  const originalMsg = intent.original_message as Record<string, unknown>;

  if (intent.passthrough) {
    const params = originalMsg?.params as Record<string, unknown> | undefined;
    const toolName = typeof params?.name === 'string' ? params.name : 'unknown';
    const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;

    return { ok: true, value: [{ tool: toolName, arguments: toolArgs }] };
  }

  const intentDef = getRegistry().get(intent.intent_type);
  if (!intentDef) {
    logger.warn('unknown_intent_type', { intent_type: intent.intent_type });
    const params = originalMsg?.params as Record<string, unknown> | undefined;
    const toolName = typeof params?.name === 'string' ? params.name : 'unknown';
    const toolArgs = (params?.arguments ?? {}) as Record<string, unknown>;
    return { ok: true, value: [{ tool: toolName, arguments: toolArgs }] };
  }

  const availableTools = new Set(capabilities?.tools?.map((t) => t.name) ?? []);
  const extractedArgs = extractArgs(intent.original_message);

  const queries: GraphQuery[] = [];

  for (const tool of intentDef.tools) {
    if (!availableTools.has(tool)) {
      logger.warn('tool_not_in_capabilities', { tool, intent: intent.intent_type });
      continue;
    }

    const argKey = ARG_KEY_BY_TOOL[tool];
    const usedFallback = argKey === undefined;
    const resolvedKey = argKey ?? 'query';
    if (usedFallback) {
      logger.warn('plan_arg_key_fallback', { tool, intent: intent.intent_type });
    }
    const args: Record<string, unknown> = {
      [resolvedKey]: extractedArgs[resolvedKey] ?? extractedArgs.query ?? '',
    };
    if (extractedArgs.lang) {
      args.lang = extractedArgs.lang;
    }
    queries.push({
      tool,
      arguments: args,
    });
  }

  logger.info('plan_result', {
    intent_type: intent.intent_type,
    query_count: queries.length,
    tools: queries.map((q) => q.tool),
  });

  return { ok: true, value: queries };
}

function extractArgs(message: unknown): Record<string, string> {
  const msg = message as Record<string, unknown> | undefined;
  const params = msg?.params as Record<string, unknown> | undefined;
  const args = (params?.arguments ?? {}) as Record<string, unknown>;

  const nameVal = typeof args.name === 'string' ? args.name : '';
  const queryVal = typeof args.query === 'string' ? args.query : '';
  const symbolVal = typeof args.symbol === 'string' ? args.symbol : '';
  const langVal = typeof args.lang === 'string' ? args.lang : '';

  return {
    query: queryVal || nameVal || symbolVal,
    symbol: symbolVal || nameVal || queryVal,
    target: typeof args.target === 'string' ? args.target : symbolVal || nameVal || queryVal,
    lang: langVal,
  };
}
