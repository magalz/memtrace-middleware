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
  it('emits config:changed when file is modified', async () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://original:8080' }), 'utf-8');

    const emitter = new EventEmitter();
    const watcher = watchConfig(CONFIG_PATH, emitter);

    await sleep(500);

    const events: Record<string, unknown>[] = [];
    emitter.on('config:changed', (delta) => {
      events.push(delta);
    });

    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://changed:9090' }), 'utf-8');
    await sleep(2000);

    expect(events.length).toBeGreaterThanOrEqual(1);

    watcher.close();
  });

  it('reverts to defaults on file deletion', async () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://custom:8080' }), 'utf-8');

    const emitter = new EventEmitter();
    const watcher = watchConfig(CONFIG_PATH, emitter);

    await sleep(500);

    const events: Record<string, unknown>[] = [];
    emitter.on('config:changed', (delta) => {
      events.push(delta);
    });

    unlinkSync(CONFIG_PATH);
    await sleep(2000);

    expect(events.length).toBeGreaterThanOrEqual(1);

    watcher.close();
  });

  it('emits config:error on invalid file content', async () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ memtrace_host: 'http://ok:8080' }), 'utf-8');

    const emitter = new EventEmitter();
    const watcher = watchConfig(CONFIG_PATH, emitter);

    await sleep(500);

    const errors: Record<string, unknown>[] = [];
    emitter.on('config:error', (err) => {
      errors.push(err);
    });

    writeFileSync(CONFIG_PATH, '{ bad json }', 'utf-8');
    await sleep(2000);

    expect(errors.length).toBeGreaterThanOrEqual(1);

    watcher.close();
  });
});
