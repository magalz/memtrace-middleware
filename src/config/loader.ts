import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { MiddlewareError } from '../errors.js';
import { createLogger } from '../logger.js';
import { DEFAULT_CONFIG, type MiddlewareConfig, middlewareConfigSchema } from './types.js';

const log = createLogger('config-loader');

export function getConfigPath(): string {
  return join(homedir(), '.memtrace', 'middleware.json');
}

function readConfigFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new MiddlewareError({
      cause: 'config_invalid',
      recoverable: false,
      suggested_action: 'check_config_file',
    });
  }
}

function parseEnvInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = Number.parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseEnvFloat(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = Number.parseFloat(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function readEnvOverrides(): Partial<MiddlewareConfig> {
  const overrides: Partial<MiddlewareConfig> = {};

  const host = process.env['MEMTRACE_HOST'];
  if (host !== undefined) overrides.memtrace_host = host;

  const token = process.env['MEMTRACE_MCP_TOKEN'];
  if (token !== undefined) overrides.memtrace_token = token;

  const subQuery = parseEnvInt(
    'MEMTRACE_SUB_QUERY_TIMEOUT',
    DEFAULT_CONFIG.timeout_budgets.sub_query_ms
  );
  const dispatch = parseEnvInt(
    'MEMTRACE_DISPATCH_TIMEOUT',
    DEFAULT_CONFIG.timeout_budgets.dispatch_ms
  );
  const probe = parseEnvInt(
    'MEMTRACE_PROBE_INTERVAL',
    DEFAULT_CONFIG.timeout_budgets.probe_interval_ms
  );
  if (
    subQuery !== DEFAULT_CONFIG.timeout_budgets.sub_query_ms ||
    dispatch !== DEFAULT_CONFIG.timeout_budgets.dispatch_ms ||
    probe !== DEFAULT_CONFIG.timeout_budgets.probe_interval_ms
  ) {
    overrides.timeout_budgets = {
      sub_query_ms: subQuery,
      dispatch_ms: dispatch,
      probe_interval_ms: probe,
    };
  }

  const floor = process.env['MEMTRACE_DEGRADATION_FLOOR'];
  if (floor !== undefined) {
    overrides.degradation_floor = floor as MiddlewareConfig['degradation_floor'];
  }

  const hysteresis = parseEnvInt(
    'MEMTRACE_HYSTERESIS_COUNT',
    DEFAULT_CONFIG.hysteresis_probe_count
  );
  if (hysteresis !== DEFAULT_CONFIG.hysteresis_probe_count) {
    overrides.hysteresis_probe_count = hysteresis;
  }

  const intents = process.env['MEMTRACE_ENABLED_INTENTS'];
  if (intents !== undefined) {
    overrides.enabled_intents = intents
      .split(',')
      .map((i) => i.trim()) as MiddlewareConfig['enabled_intents'];
  }

  const threshold = parseEnvFloat(
    'MEMTRACE_CLASSIFICATION_THRESHOLD',
    DEFAULT_CONFIG.classification_threshold
  );
  if (threshold !== DEFAULT_CONFIG.classification_threshold) {
    overrides.classification_threshold = threshold;
  }

  return overrides;
}

function applyOverrides(
  base: MiddlewareConfig,
  overrides: Partial<MiddlewareConfig>
): MiddlewareConfig {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'timeout_budgets' && value !== undefined) {
      result.timeout_budgets = {
        ...result.timeout_budgets,
        ...(value as typeof result.timeout_budgets),
      };
    } else if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function redactSensitive(raw: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...raw };
  if (
    'memtrace_token' in clone &&
    typeof clone['memtrace_token'] === 'string' &&
    clone['memtrace_token'] !== ''
  ) {
    clone['memtrace_token'] = '<REDACTED>';
  }
  return clone;
}

export function loadConfig(cliOverrides?: Partial<MiddlewareConfig>): MiddlewareConfig {
  let config = { ...DEFAULT_CONFIG };

  const configPath = getConfigPath();
  const fileData = readConfigFile(configPath);
  if (fileData !== null) {
    config = applyOverrides(config, fileData as Partial<MiddlewareConfig>);
    log.info('config loaded from file', {
      path: configPath,
      sources: redactSensitive(fileData),
    });
  } else {
    log.info('no config file found, using defaults', { path: configPath });
  }

  const envOverrides = readEnvOverrides();
  if (Object.keys(envOverrides).length > 0) {
    config = applyOverrides(config, envOverrides);
    log.info('env overrides applied', {
      overrides: redactSensitive(envOverrides as Record<string, unknown>),
    });
  }

  if (cliOverrides && Object.keys(cliOverrides).length > 0) {
    config = applyOverrides(config, cliOverrides);
    log.info('CLI overrides applied', {
      overrides: redactSensitive(cliOverrides as Record<string, unknown>),
    });
  }

  const parsed = middlewareConfigSchema.safeParse(config);
  if (!parsed.success) {
    throw new MiddlewareError({
      cause: 'config_invalid',
      recoverable: false,
      suggested_action: 'check_config_file',
      tier: undefined,
    });
  }

  return parsed.data;
}

export function ensureConfigDir(): void {
  const dir = join(homedir(), '.memtrace');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function writeConfig(config: MiddlewareConfig, path?: string): void {
  const target = path ?? getConfigPath();
  ensureConfigDir();
  const parent = dirname(target);
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true });
  }
  try {
    writeFileSync(target, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err: unknown) {
    throw new MiddlewareError({
      cause: 'config_invalid',
      recoverable: false,
      suggested_action: 'check_config_file_permissions',
    });
  }
  log.info('config written', { path: target });
}
