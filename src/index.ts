export { DegradationTier } from './types.js';
export type {
  ErrorCause,
  MiddlewareErrorShape,
  MemtraceCapabilities,
  ToolSchema,
  QueryResult,
  FusedInput,
  FusedContext,
  ContextBlock,
  ClassifiedIntent,
  GraphQuery,
  Result,
} from './types.js';

export { MiddlewareError } from './errors.js';

export {
  MAX_SUB_QUERY_TIMEOUT_MS,
  MAX_DISPATCH_TIMEOUT_MS,
  PROBE_INTERVAL_MS,
  HYSTERESIS_PROBE_COUNT,
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  DEDUP_CACHE_TTL_MS,
  STATUS_REFRESH_MS,
  MCP_TOOL_FIND_CODE,
  MCP_TOOL_GET_SYMBOL_CONTEXT,
  MCP_TOOL_GET_IMPACT,
} from './constants.js';

export { createLogger } from './logger.js';
export type { Logger } from './logger.js';

export { fuse, validateContext } from './fusion/index.js';

export type { MemtraceBackend, DegradationProbeHooks } from './backend/index.js';

export {
  BaseAdapter,
  createDispatchContext,
  cleanupContext,
  validateToolCall,
} from './interface/index.js';
export type {
  DispatchContext,
  ToolProvider,
  ContextBuilder,
  Session,
  SessionState,
  AgentResponse,
  ToolCallMessage,
} from './interface/index.js';

export { createCliAdapter } from './adapters/index.js';

export {
  loadConfig,
  getConfigPath,
  watchConfig,
  getCurrentConfig,
  DEFAULT_CONFIG,
  normalizeFloor,
  discoverEnvironment,
  readWorkspaceConfig,
} from './config/index.js';
export type {
  MiddlewareConfig,
  ConfigDelta,
  DegradationFloor,
  IntentType,
  EnvironmentInfo,
} from './config/index.js';
