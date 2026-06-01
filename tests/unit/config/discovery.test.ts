import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { discoverEnvironment, readWorkspaceConfig } from '../../../src/config/discovery.js';

function normalizePath(p: string): string {
  return resolve(p).replace(/[\\/]$/, '');
}

function createTempDir(): string {
  const dir = join(
    tmpdir(),
    `discovery-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('discoverEnvironment', () => {
  it('[P0] should detect project root as git repo with package.json and tsconfig', () => {
    const { sync } = discoverEnvironment();

    expect(sync.project_root).toBeTruthy();
    expect(sync.is_git_repo).toBe(true);
    expect(sync.has_package_json).toBe(true);
    expect(sync.has_ts_config).toBe(true);
    expect(sync.config_file_path).toContain('.memtrace');
  });

  it('[P0] should return sync info immediately without I/O', () => {
    const { sync } = discoverEnvironment();

    expect(typeof sync.project_root).toBe('string');
    expect(typeof sync.is_git_repo).toBe('boolean');
    expect(typeof sync.has_package_json).toBe('boolean');
    expect(typeof sync.has_ts_config).toBe('boolean');
    expect(sync.memtrace_indexed).toBe(false);
    expect(typeof sync.config_file_path).toBe('string');
  });

  it('[P0] should provide a probe function that resolves to boolean', async () => {
    const { probe } = discoverEnvironment(async () => true);

    const result = await probe();
    expect(typeof result).toBe('boolean');
  });

  it('[P0] should return false from probe when host is unreachable', async () => {
    const { probe } = discoverEnvironment(async () => {
      throw new Error('ECONNREFUSED');
    });

    const result = await probe();
    expect(result).toBe(false);
  });

  it('[P1] should detect workspace anchor when .memtrace directory exists', () => {
    const tempDir = createTempDir();

    try {
      const gitDir = join(tempDir, '.git');
      mkdirSync(gitDir);
      const memtraceDir = join(tempDir, '.memtrace');
      mkdirSync(memtraceDir);

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();
        expect(normalizePath(sync.workspace_anchor!)).toBe(normalizePath(memtraceDir));
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P1] should detect workspace anchor when .memtrace-workspace exists', () => {
    const tempDir = createTempDir();

    try {
      const gitDir = join(tempDir, '.git');
      mkdirSync(gitDir);
      const workspaceFile = join(tempDir, '.memtrace-workspace');
      writeFileSync(workspaceFile, '');

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();
        expect(normalizePath(sync.workspace_anchor!)).toBe(normalizePath(workspaceFile));
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P1] should return null workspace anchor when no marker exists', () => {
    const tempDir = createTempDir();

    try {
      mkdirSync(join(tempDir, '.git'));

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();
        expect(sync.workspace_anchor).toBeNull();
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P2] should not detect git in non-git temp directory', () => {
    const tempDir = createTempDir();

    try {
      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();
        expect(sync.is_git_repo).toBe(false);
        expect(normalizePath(sync.project_root)).toBe(normalizePath(tempDir));
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('readWorkspaceConfig', () => {
  it('[P1] should return null for non-existent config', () => {
    const result = readWorkspaceConfig('/nonexistent/path');
    expect(result).toBeNull();
  });

  it('[P1] should parse valid workspace config.json', () => {
    const tempDir = createTempDir();

    try {
      writeFileSync(
        join(tempDir, 'config.json'),
        JSON.stringify({ repo_id: 'test-repo', host: 'http://localhost:9090' })
      );

      const config = readWorkspaceConfig(tempDir);
      expect(config).not.toBeNull();
      expect(config!.repo_id).toBe('test-repo');
      expect(config!.host).toBe('http://localhost:9090');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P1] should return null for invalid JSON in config', () => {
    const tempDir = createTempDir();

    try {
      writeFileSync(join(tempDir, 'config.json'), '{invalid}');

      const config = readWorkspaceConfig(tempDir);
      expect(config).toBeNull();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
