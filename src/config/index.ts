export { loadConfig, getConfigPath, ensureConfigDir } from './loader.js';
export { watchConfig, getCurrentConfig } from './watcher.js';
export {
  DEFAULT_CONFIG,
  middlewareConfigSchema,
  normalizeFloor,
  DEGRADATION_FLOOR_VALUES,
  INTENT_TYPE_VALUES,
} from './types.js';
export type { MiddlewareConfig, ConfigDelta, DegradationFloor, IntentType } from './types.js';
