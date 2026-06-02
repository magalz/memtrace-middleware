import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { runInit, shutdown } from '../../../src/cli/index.js';
import { createLogger } from '../../../src/logger.js';
import { loadConfig, getConfigPath, writeConfig } from '../../../src/config/index.js';
import { DEFAULT_CONFIG } from '../../../src/config/types.js';

describe('cli index — shutdown', () => {
  // AC5 — shutdown calls shutdownDegradation
  it('[P0] [AC5] shutdown completes without throwing when no server or backend is active', async () => {
    // Given: no active MCP server or backend
    // When: shutdown() is called
    // Then: it completes without throwing
    await expect(shutdown()).resolves.not.toThrow();
  });
});

describe('cli index — stderr-only logging', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  // AC6 — logger writes to stderr, not stdout
  it('[P1] [AC6] createLogger writes structured logs to stderr — stdout is never written by logger', () => {
    const log = createLogger('test-ac6');
    log.info('test_message', { key: 'value' });

    // Given: the logger module
    // When: a log message is emitted
    // Then: it writes to stderr, NOT stdout
    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

const testTmpDir = vi.hoisted(
  () =>
    process.cwd() +
    '/.test-tmp-cli-init-' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 8)
);

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    homedir: () => testTmpDir,
  };
});

describe('cli index — runInit', () => {
  const MEMTRACE_DIR = join(testTmpDir, '.memtrace');
  const CONFIG_PATH = join(MEMTRACE_DIR, 'middleware.json');

  beforeEach(() => {
    mkdirSync(MEMTRACE_DIR, { recursive: true });
    try {
      rmSync(CONFIG_PATH, { force: true });
    } catch {
      /* ignore */
    }
    delete process.env['MEMTRACE_HOST'];
    delete process.env['MEMTRACE_MCP_TOKEN'];
  });

  afterEach(() => {
    try {
      rmSync(testTmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // AC1 — idempotency check in runInit
  it('[P0] runInit prints notice and does not overwrite when config exists without --force', async () => {
    // Given: a config file already exists
    writeConfig({ ...DEFAULT_CONFIG, memtrace_host: 'http://original:8080' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    // When: runInit(false) is called
    await runInit(false);
    const calls = stderrSpy.mock.calls.map((c) => String(c[0])).join('');

    // Then: the original config is NOT overwritten
    expect(calls).toContain('Configuration already exists');
    const reloaded = loadConfig();
    expect(reloaded.memtrace_host).toBe('http://original:8080');
    stderrSpy.mockRestore();
  });

  // AC4 — --force flag overwrites existing config
  it('[P0] runInit with --force overwrites existing config', async () => {
    // Given: a config file already exists
    writeConfig({ ...DEFAULT_CONFIG, memtrace_host: 'http://old:8080' });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.env['MEMTRACE_HOST'] = 'http://new:9090';

    // When: runInit(true) is called with MEMTRACE_HOST env
    await runInit(true);
    const calls = stderrSpy.mock.calls.map((c) => String(c[0])).join('');

    // Then: the config is overwritten with new values
    expect(calls).not.toContain('Configuration already exists');
    const reloaded = loadConfig();
    expect(reloaded.memtrace_host).toBe('http://new:9090');
    delete process.env['MEMTRACE_HOST'];
    stderrSpy.mockRestore();
  });
});
