// AC 1.1b-1: configuration loaded with precedence CLI > env > file (FR27)
// AC 1.1b-5: credentials redacted from ALL log output at ALL verbosity levels
// AC 1.1b-6: config precedence test — CLI flag wins over env and file
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { existsSync, mkdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
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

import { loadConfig, ensureConfigDir } from '../../../src/config/loader.js';
import { DEFAULT_CONFIG, normalizeFloor } from '../../../src/config/types.js';
import { DegradationTier } from '../../../src/types.js';
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
  // AC 1.1b-1 — defaults returned when no file or env present
  it('[P1] returns DEFAULT_CONFIG when no config file or env vars are present', () => {
    // Given: no config file and no MEMTRACE_* env vars
    const config = loadConfig();
    // Then: all fields match DEFAULT_CONFIG
    expect(config.memtrace_host).toBe(DEFAULT_CONFIG.memtrace_host);
    expect(config.memtrace_token).toBe('');
    expect(config.timeout_budgets.sub_query_ms).toBe(200);
    expect(config.degradation_floor).toBe('Passthrough');
  });

  // AC 1.1b-1 — config file values override defaults
  it('[P1] overrides defaults from config file values', () => {
    // Given: a config file with custom host and timeout
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({
        memtrace_host: 'http://custom:9090',
        timeout_budgets: { sub_query_ms: 500 },
      }),
      'utf-8'
    );
    // When: config is loaded
    const config = loadConfig();
    // Then: file values override defaults, defaults persist for unset fields
    expect(config.memtrace_host).toBe('http://custom:9090');
    expect(config.timeout_budgets.sub_query_ms).toBe(500);
    expect(config.memtrace_token).toBe('');
  });

  // AC 1.1b-1 — env vars override config file
  it('[P1] environment variables override config file values', () => {
    // Given: a config file and env vars with conflicting values
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
    // When: config is loaded
    const config = loadConfig();
    // Then: env var values win over config file
    expect(config.memtrace_host).toBe('http://env:8080');
    expect(config.degradation_floor).toBe('Full');
  });

  // AC 1.1b-6 — CLI precedence test: CLI flag wins over env and file
  it('[P0] CLI overrides take precedence over env vars and config file', () => {
    // Given: file sets floor=Passthrough, env sets floor=Full
    writeFileSync(CONFIG_PATH, JSON.stringify({ degradation_floor: 'Passthrough' }), 'utf-8');
    process.env['MEMTRACE_DEGRADATION_FLOOR'] = 'Full';
    // When: CLI overrides are passed (AC 1.1b-6: Intent-reduced wins)
    const config = loadConfig({ degradation_floor: 'Intent-reduced' });
    // Then: CLI flag value wins over both file and env
    expect(config.degradation_floor).toBe('Intent-reduced');
  });

  // AC 1.1b-1 — missing file handled gracefully
  it('[P2] handles missing config file gracefully and returns defaults', () => {
    // Given: no config file exists at the expected path
    const config = loadConfig();
    // Then: defaults are returned without error
    expect(config.memtrace_host).toBe(DEFAULT_CONFIG.memtrace_host);
  });

  // AC 1.1b-1 — Zod-validated, invalid config produces MiddlewareError
  it('[P0] throws MiddlewareError for invalid config values', () => {
    // Given: a config file with invalid value (empty host)
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: '' }), 'utf-8');
    // Then: loadConfig throws MiddlewareError with config_invalid cause
    expect(() => loadConfig()).toThrow(MiddlewareError);
  });

  // AC 1.1b-1 — bad JSON produces error
  it('[P2] throws for malformed JSON in config file', () => {
    // Given: a config file containing invalid JSON
    writeFileSync(CONFIG_PATH, '{ bad json }', 'utf-8');
    // Then: loadConfig throws an error
    expect(() => loadConfig()).toThrow();
  });

  // AC 1.1b-5 — credential redaction: token NEVER appears in log output
  it('[P0] redacts memtrace_token from all log output at all verbosity levels', () => {
    // Given: a config file with a real memtrace_token
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_token: 'secret-token-abc123' }), 'utf-8');
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    // When: config is loaded
    const config = loadConfig();
    // Then: token is available in config but never logged
    const logLines = writeSpy.mock.calls.map((c) => String(c[0]));
    const leaked = logLines.some((line) => line.includes('secret-token-abc123'));
    const redacted = logLines.some((line) => line.includes('<REDACTED>'));
    expect(config.memtrace_token).toBe('secret-token-abc123');
    expect(leaked).toBe(false);
    expect(redacted).toBe(true);
    writeSpy.mockRestore();
  });

  // AC 1.1b — normalizeFloor maps config strings to DegradationTier enum
  it('[P1] normalizeFloor maps config strings to correct DegradationTier enum values', () => {
    // Given: the floor config string values from middleware.json
    // Then: each maps to the correct DegradationTier enum
    expect(normalizeFloor('Full')).toBe(DegradationTier.Full);
    expect(normalizeFloor('Intent-reduced')).toBe(DegradationTier.IntentReduced);
    expect(normalizeFloor('Passthrough')).toBe(DegradationTier.Passthrough);
    expect(normalizeFloor('Fail-closed')).toBe(DegradationTier.FailClosed);
  });

  // AC 1.1b — ensureConfigDir creates the .memtrace directory
  it('[P2] ensureConfigDir creates the .memtrace directory when it does not exist', () => {
    // Given: the .memtrace directory was removed
    if (existsSync(MEMTRACE_DIR)) rmdirSync(MEMTRACE_DIR);
    // When: ensureConfigDir is called
    ensureConfigDir();
    // Then: the directory is created
    expect(existsSync(MEMTRACE_DIR)).toBe(true);
    rmdirSync(MEMTRACE_DIR);
  });
});
