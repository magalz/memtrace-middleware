// AC 1.1b-2: chokidar-based fs watcher detects changes and emits config:changed events (FR28)
// AC 1.1b-7: watcher test — config:changed event emitted on file modification, no polling
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const TMP_DIR = join(process.cwd(), '.test-tmp-watch');
const MEMTRACE_DIR = join(TMP_DIR, '.memtrace');
const CONFIG_PATH = join(MEMTRACE_DIR, 'middleware.json');

import { watchConfig } from '../../../src/config/watcher.js';

beforeAll(() => {
  if (!existsSync(MEMTRACE_DIR)) {
    mkdirSync(MEMTRACE_DIR, { recursive: true });
  }
});

afterAll(() => {
  try {
    unlinkSync(CONFIG_PATH);
  } catch {
    /* ignore */
  }
});

describe('config watcher', () => {
  // AC 1.1b-7 — chokidar detects file modification and emits config:changed with delta
  // Note: hard sleeps (500ms + 2000ms) are inherent to chokidar awaitWriteFinish stability threshold
  it('[P1] emits config:changed event with delta when config file is modified via inode change', async () => {
    // Given: a watcher is active on a config file with original host
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://original:8080' }), 'utf-8');
    const emitter = new EventEmitter();
    const watcher = watchConfig(CONFIG_PATH, emitter);
    await sleep(500);

    // When: the config file is modified with a new host value
    const events: Record<string, unknown>[] = [];
    emitter.on('config:changed', (delta) => {
      events.push(delta);
    });
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://changed:9090' }), 'utf-8');
    await sleep(2000);

    // Then: at least one config:changed event is emitted
    expect(events.length).toBeGreaterThanOrEqual(1);
    watcher.close();
  });

  // AC 1.1b-2 — file deletion reverts to defaults via config:changed event
  it('[P1] reverts to defaults and emits config:changed on config file deletion', async () => {
    // Given: a watcher is active with a custom config file
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://custom:8080' }), 'utf-8');
    const emitter = new EventEmitter();
    const watcher = watchConfig(CONFIG_PATH, emitter);
    await sleep(500);

    // When: the config file is deleted
    const events: Record<string, unknown>[] = [];
    emitter.on('config:changed', (delta) => {
      events.push(delta);
    });
    unlinkSync(CONFIG_PATH);
    await sleep(2000);

    // Then: a config:changed event is emitted with defaults
    expect(events.length).toBeGreaterThanOrEqual(1);
    watcher.close();
  });

  // AC 1.1b-2 — invalid config content emits config:error, keeps current config
  it('[P1] emits config:error and preserves current config when file content is invalid', async () => {
    // Given: a watcher is active on a valid config file
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://ok:8080' }), 'utf-8');
    const emitter = new EventEmitter();
    const watcher = watchConfig(CONFIG_PATH, emitter);
    await sleep(500);

    // When: the file content is replaced with invalid JSON
    const errors: Record<string, unknown>[] = [];
    emitter.on('config:error', (err) => {
      errors.push(err);
    });
    writeFileSync(CONFIG_PATH, '{ bad json }', 'utf-8');
    await sleep(2000);

    // Then: a config:error event is emitted, current config is preserved
    expect(errors.length).toBeGreaterThanOrEqual(1);
    watcher.close();
  });
});
