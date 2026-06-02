import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { shutdown } from '../../../src/cli/index.js';
import { createLogger } from '../../../src/logger.js';

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
