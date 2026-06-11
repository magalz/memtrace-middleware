import {
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  MCP_TOOL_FIND_AST_REVIEW_ISSUES,
  MCP_TOOL_FIND_BRIDGE_SYMBOLS,
  MCP_TOOL_FIND_CENTRAL_SYMBOLS,
  MCP_TOOL_FIND_CODE,
  MCP_TOOL_FIND_DEAD_CODE,
  MCP_TOOL_FIND_DEPENDENCY_PATH,
  MCP_TOOL_GET_API_TOPOLOGY,
  MCP_TOOL_GET_EVOLUTION,
  MCP_TOOL_GET_IMPACT,
  MCP_TOOL_GET_PROCESS_FLOW,
  MCP_TOOL_GET_STYLE_FINGERPRINT,
  MCP_TOOL_GET_SYMBOL_CONTEXT,
} from '../constants.js';
import { MiddlewareError } from '../errors.js';
import { createLogger } from '../logger.js';
import type { ClassifiedIntent, MemtraceCapabilities, Result } from '../types.js';
import { IntentRegistry } from './types.js';

const logger = createLogger('router');

const registry = new IntentRegistry();

const TOOL_BONUS = 4;
const NO_TEXT_BONUS = 1;

const patternRegexCache = new Map<string, RegExp>();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPatternRegex(pattern: string): RegExp {
  const key = pattern.toLowerCase();
  let regex = patternRegexCache.get(key);
  if (!regex) {
    regex = new RegExp('\\b' + escapeRegex(pattern) + '\\b', 'i');
    patternRegexCache.set(key, regex);
  }
  return regex;
}

const ALL_TOOLS = [
  MCP_TOOL_FIND_CODE,
  MCP_TOOL_GET_SYMBOL_CONTEXT,
  MCP_TOOL_GET_IMPACT,
  MCP_TOOL_FIND_AST_REVIEW_ISSUES,
  MCP_TOOL_GET_STYLE_FINGERPRINT,
  MCP_TOOL_FIND_DEAD_CODE,
  MCP_TOOL_GET_EVOLUTION,
  MCP_TOOL_GET_PROCESS_FLOW,
  MCP_TOOL_GET_API_TOPOLOGY,
  MCP_TOOL_FIND_BRIDGE_SYMBOLS,
  MCP_TOOL_FIND_CENTRAL_SYMBOLS,
  MCP_TOOL_FIND_DEPENDENCY_PATH,
];

export function classify(
  message: Record<string, unknown>,
  capabilities: MemtraceCapabilities
): Result<ClassifiedIntent> {
  if (!message || typeof message !== 'object') {
    return {
      ok: false,
      error: new MiddlewareError({
        cause: 'classification_failed',
        recoverable: true,
        suggested_action: 'retry_with_valid_message',
      }).toShape(),
    };
  }

  const availableTools = new Set(capabilities?.tools?.map((t) => t.name) ?? []);

  for (const tool of ALL_TOOLS) {
    if (!availableTools.has(tool)) {
      logger.debug('tool_not_in_capabilities', { tool });
    }
  }

  const messageText = extractSearchText(message);
  const toolName = extractToolName(message);

  const intents = registry.list();
  const hasText = messageText.length > 0;

  const scores = intents.map((def) => {
    let score = 0;

    for (const pattern of def.patterns) {
      if (!pattern || pattern.trim().length === 0) continue;
      if (getPatternRegex(pattern).test(messageText)) {
        score += 1;
      }
    }

    if (toolName && registry.getIntentForTool(toolName) === def.type) {
      score += TOOL_BONUS;
    }

    if (!hasText && toolName && registry.getIntentForTool(toolName) === def.type) {
      score += NO_TEXT_BONUS;
    }

    const weight = def.confidenceWeight ?? 1.0;
    const weightedScore = score * weight;

    return { type: def.type, score: weightedScore };
  });

  if (scores.length === 0) {
    return {
      ok: true,
      value: {
        intent_type: 'unknown',
        confidence: 0,
        passthrough: true,
        original_message: message,
      },
    };
  }

  const topScore = scores.reduce((best, s) => (s.score > best.score ? s : best));
  const totalScore = scores.reduce((sum, s) => sum + s.score, 0);

  const confidence = totalScore > 0 ? topScore.score / totalScore : 0;
  const passthrough = confidence < CLASSIFICATION_CONFIDENCE_THRESHOLD || totalScore === 0;

  const intentType = totalScore === 0 ? 'unknown' : topScore.type;

  logger.info('classification_result', {
    intent_type: intentType,
    confidence,
    passthrough,
    message_tool: toolName ?? 'none',
  });

  return {
    ok: true,
    value: {
      intent_type: intentType,
      confidence,
      passthrough,
      original_message: message,
    },
  };
}

export function getRegistry(): IntentRegistry {
  return registry;
}

function extractSearchText(message: Record<string, unknown>): string {
  const params = message.params as Record<string, unknown> | undefined;
  const args = params?.arguments as Record<string, unknown> | undefined;
  if (args?.query && typeof args.query === 'string') return args.query;
  if (args?.name && typeof args.name === 'string') return args.name;
  logger.debug('extractSearchText_fallback_to_stringify', {
    message_keys: Object.keys(message).slice(0, 5),
  });
  return JSON.stringify(message);
}

function extractToolName(message: Record<string, unknown>): string | undefined {
  const params = message.params as Record<string, unknown> | undefined;
  if (params?.name && typeof params.name === 'string') return params.name;
  return undefined;
}
