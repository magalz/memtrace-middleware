import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverEnvironment, readWorkspaceConfig } from '../../src/config/discovery.js';
import { writeConfig } from '../../src/config/loader.js';
import { DEFAULT_CONFIG } from '../../src/config/types.js';

function createTempDir(base: string): string {
  const dir = join(
    process.cwd(),
    `.test-tmp-${base}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function setupGitAndMemtrace(tempDir: string, configJson?: Record<string, unknown>): string {
  const gitDir = join(tempDir, '.git');
  mkdirSync(gitDir);

  const memtraceDir = join(tempDir, '.memtrace');
  mkdirSync(memtraceDir, { recursive: true });

  writeFileSync(
    join(memtraceDir, 'config.json'),
    JSON.stringify(configJson ?? { repo_id: 'test-repo' })
  );

  return memtraceDir;
}

describe('init round-trip', () => {
  it('[P1] mtm init with .git + .memtrace/config.json detects indexed repo', () => {
    const tempDir = createTempDir('init-detection');

    try {
      setupGitAndMemtrace(tempDir);

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();

        expect(sync.is_git_repo).toBe(true);
        expect(sync.memtrace_indexed).toBe(true);
        expect(sync.workspace_anchor).not.toBeNull();

        const configDir = join(tempDir, 'config-home', '.memtrace');
        const configPath = join(configDir, 'middleware.json');
        const config = { ...DEFAULT_CONFIG, memtrace_host: 'http://localhost:9090' };

        writeConfig(config, configPath);

        const wsConfig = readWorkspaceConfig(sync.workspace_anchor!);
        expect(wsConfig).not.toBeNull();
        expect(wsConfig!.repo_id).toBe('test-repo');
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P2] mtm init with no Memtrace index returns memtrace_indexed false', () => {
    const tempDir = createTempDir('no-index');

    try {
      const gitDir = join(tempDir, '.git');
      mkdirSync(gitDir);

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();

        expect(sync.is_git_repo).toBe(true);
        expect(sync.memtrace_indexed).toBe(false);

        const configPath = join(tempDir, 'config-home', '.memtrace', 'middleware.json');
        writeConfig({ ...DEFAULT_CONFIG }, configPath);
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P2] writeConfig writes config with expected content at custom path', () => {
    const tempDir = createTempDir('write-config');

    try {
      const configPath = join(tempDir, 'middleware.json');

      const config = {
        ...DEFAULT_CONFIG,
        memtrace_host: 'http://custom-test:9090',
        degradation_floor: 'Full' as const,
      };

      writeConfig(config, configPath);

      expect(existsSync(configPath)).toBe(true);

      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);

      expect(parsed.memtrace_host).toBe('http://custom-test:9090');
      expect(parsed.degradation_floor).toBe('Full');
      expect(parsed.memtrace_token).toBe('');

      const indentMatch = raw.includes('  ');
      expect(indentMatch).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P1] workspace config host field is readable from .memtrace/config.json', () => {
    const tempDir = createTempDir('host-propagation');
    const customHost = 'http://custom:9090';

    try {
      setupGitAndMemtrace(tempDir, { repo_id: 'test-repo', host: customHost });

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);
        const { sync } = discoverEnvironment();

        expect(sync.memtrace_indexed).toBe(true);
        expect(sync.workspace_anchor).not.toBeNull();

        const wsConfig = readWorkspaceConfig(sync.workspace_anchor!);
        expect(wsConfig).not.toBeNull();
        expect(wsConfig!.host).toBe(customHost);
        expect(wsConfig!.repo_id).toBe('test-repo');
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('[P2] writeConfig creates parent directories when missing', () => {
    const tempDir = createTempDir('parent-dirs');
    const deepPath = join(tempDir, 'a', 'b', 'c', 'middleware.json');

    try {
      writeConfig({ ...DEFAULT_CONFIG }, deepPath);

      expect(existsSync(deepPath)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // AC-3: init operations complete well within 5-minute budget
  it('[P1] discoverEnvironment + writeConfig completes within 1 second', () => {
    const tempDir = createTempDir('timing');

    try {
      setupGitAndMemtrace(tempDir);

      const currentCwd = process.cwd();
      try {
        process.chdir(tempDir);

        const start = performance.now();

        const { sync } = discoverEnvironment();
        const configPath = join(tempDir, 'timing-test-config.json');
        writeConfig({ ...DEFAULT_CONFIG, memtrace_host: 'http://timing:8080' }, configPath);

        const elapsed = performance.now() - start;

        // AC 3 requires ≤5 min (300000ms). Local operations should be <1000ms.
        expect(sync.memtrace_indexed).toBe(true);
        expect(existsSync(configPath)).toBe(true);
        expect(elapsed).toBeLessThan(1000);
      } finally {
        process.chdir(currentCwd);
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
