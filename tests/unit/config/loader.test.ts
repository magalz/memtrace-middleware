import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TMP_DIR = join(process.cwd(), '.test-tmp-config');
const MEMTRACE_DIR = join(TMP_DIR, '.memtrace');
const CONFIG_PATH = join(MEMTRACE_DIR, 'middleware.json');

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => TMP_DIR,
  };
});

import { loadConfig } from '../../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../../src/config/types.js';
import { MiddlewareError } from '../../../src/errors.js';

beforeEach(() => {
  if (!existsSync(MEMTRACE_DIR)) {
    mkdirSync(MEMTRACE_DIR, { recursive: true });
  }
  try {
    unlinkSync(CONFIG_PATH);
  } catch {
    /* ignore */
  }

  const envKeys = [
    'MEMTRACE_HOST',
    'MEMTRACE_MCP_TOKEN',
    'MEMTRACE_SUB_QUERY_TIMEOUT',
    'MEMTRACE_DISPATCH_TIMEOUT',
    'MEMTRACE_PROBE_INTERVAL',
    'MEMTRACE_DEGRADATION_FLOOR',
    'MEMTRACE_HYSTERESIS_COUNT',
    'MEMTRACE_ENABLED_INTENTS',
    'MEMTRACE_CLASSIFICATION_THRESHOLD',
  ];
  for (const k of envKeys) {
    delete process.env[k];
  }
});

afterAll(() => {
  try {
    unlinkSync(CONFIG_PATH);
  } catch {
    /* ignore */
  }
});

describe('config loader', () => {
  it('returns defaults when no file or env is present', () => {
    const config = loadConfig();
    expect(config.memtrace_host).toBe(DEFAULT_CONFIG.memtrace_host);
    expect(config.memtrace_token).toBe('');
    expect(config.timeout_budgets.sub_query_ms).toBe(200);
    expect(config.degradation_floor).toBe('Passthrough');
  });

  it('overrides defaults from config file', () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        memtrace_host: 'http://custom:9090',
        timeout_budgets: { sub_query_ms: 500 },
      }),
      'utf-8'
    );

    const config = loadConfig();
    expect(config.memtrace_host).toBe('http://custom:9090');
    expect(config.timeout_budgets.sub_query_ms).toBe(500);
    expect(config.memtrace_token).toBe('');
  });

  it('env vars override config file values', () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        memtrace_host: 'http://file:9090',
        degradation_floor: 'Passthrough',
      }),
      'utf-8'
    );

    process.env['MEMTRACE_HOST'] = 'http://env:8080';
    process.env['MEMTRACE_DEGRADATION_FLOOR'] = 'Full';

    const config = loadConfig();
    expect(config.memtrace_host).toBe('http://env:8080');
    expect(config.degradation_floor).toBe('Full');
  });

  it('CLI overrides take precedence over env and file', () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        degradation_floor: 'Passthrough',
      }),
      'utf-8'
    );

    process.env['MEMTRACE_DEGRADATION_FLOOR'] = 'Full';

    const config = loadConfig({ degradation_floor: 'Intent-reduced' });
    expect(config.degradation_floor).toBe('Intent-reduced');
  });

  it('handles missing config file gracefully', () => {
    const config = loadConfig();
    expect(config.memtrace_host).toBe(DEFAULT_CONFIG.memtrace_host);
  });

  it('throws MiddlewareError for invalid config', () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        memtrace_host: '',
      }),
      'utf-8'
    );

    expect(() => loadConfig()).toThrow(MiddlewareError);
  });

  it('throws for bad JSON in config file', () => {
    writeFileSync(CONFIG_PATH, '{ bad json }', 'utf-8');
    expect(() => loadConfig()).toThrow();
  });
});
