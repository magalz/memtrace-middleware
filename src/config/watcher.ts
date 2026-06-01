import { watch as chokidarWatch } from 'chokidar';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';

import { createLogger } from '../logger.js';
import {
  DEFAULT_CONFIG,
  type ConfigDelta,
  type MiddlewareConfig,
  middlewareConfigSchema,
} from './types.js';

const log = createLogger('config-watcher');

let currentConfig: MiddlewareConfig = { ...DEFAULT_CONFIG };

export function getCurrentConfig(): MiddlewareConfig {
  return { ...currentConfig };
}

function readConfig(path: string): MiddlewareConfig | null {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const merged = { ...DEFAULT_CONFIG, ...parsed };
    const result = middlewareConfigSchema.safeParse(merged);
    if (!result.success) {
      log.error('invalid config after hot-reload', { path });
      return null;
    }
    return result.data;
  } catch {
    log.error('failed to read config after hot-reload', { path });
    return null;
  }
}

function computeDelta(old: MiddlewareConfig, next: MiddlewareConfig): ConfigDelta {
  const delta: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof MiddlewareConfig)[]) {
    if (key === 'timeout_budgets') {
      const ob = old.timeout_budgets;
      const nb = next.timeout_budgets;
      const tbDelta: Record<string, number> = {};
      if (ob.sub_query_ms !== nb.sub_query_ms) tbDelta.sub_query_ms = nb.sub_query_ms;
      if (ob.dispatch_ms !== nb.dispatch_ms) tbDelta.dispatch_ms = nb.dispatch_ms;
      if (ob.probe_interval_ms !== nb.probe_interval_ms)
        tbDelta.probe_interval_ms = nb.probe_interval_ms;
      if (Object.keys(tbDelta).length > 0) delta.timeout_budgets = tbDelta;
    } else if (key === 'enabled_intents') {
      const oi = old.enabled_intents.join(',');
      const ni = next.enabled_intents.join(',');
      if (oi !== ni) delta.enabled_intents = [...next.enabled_intents];
    } else if (old[key] !== next[key]) {
      delta[key] = next[key];
    }
  }
  return delta as ConfigDelta;
}

export function watchConfig(configPath: string, emitter: EventEmitter): { close: () => void } {
  const watcher = chokidarWatch(configPath, {
    awaitWriteFinish: {
      stabilityThreshold: 500,
    },
    ignoreInitial: true,
  });

  watcher.on('change', () => {
    const next = readConfig(configPath);
    if (next === null) {
      emitter.emit('config:error', { path: configPath, cause: 'invalid_config' });
      return;
    }
    const old = currentConfig;
    currentConfig = next;
    const delta = computeDelta(old, next);
    if (Object.keys(delta).length > 0) {
      emitter.emit('config:changed', delta);
      log.info('config hot-reloaded', { fields: Object.keys(delta) });
    }
  });

  watcher.on('add', () => {
    const next = readConfig(configPath);
    if (next === null) {
      emitter.emit('config:error', { path: configPath, cause: 'invalid_config' });
      return;
    }
    currentConfig = next;
    emitter.emit('config:changed', { ...next });
    log.info('config file created, loaded new config');
  });

  watcher.on('unlink', () => {
    currentConfig = { ...DEFAULT_CONFIG };
    emitter.emit('config:changed', { ...DEFAULT_CONFIG });
    log.info('config file deleted, reverted to defaults');
  });

  watcher.on('error', (err) => {
    log.error('chokidar watcher error', { path: configPath, error: String(err) });
    emitter.emit('config:error', { path: configPath, cause: 'watch_error' });
  });

  return {
    close: () => watcher.close(),
  };
}
