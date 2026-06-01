import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLogger } from '../logger.js';

const log = createLogger('config-discovery');

export interface EnvironmentInfo {
  project_root: string;
  has_package_json: boolean;
  has_ts_config: boolean;
  is_git_repo: boolean;
  workspace_anchor: string | null;
  memtrace_indexed: boolean;
  config_file_path: string;
}

function findUpDir(startDir: string, predicate: (dir: string) => boolean): string | null {
  let current = resolve(startDir);
  const root = dirname(current) === current ? current : null;

  while (current && current !== root) {
    if (predicate(current)) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return predicate(current) ? current : null;
}

function getCwd(): string {
  try {
    const cwd = fileURLToPath(new URL('.', `file://${process.cwd().replace(/\\/g, '/')}/`));
    return cwd;
  } catch {
    return process.cwd();
  }
}

export function discoverEnvironment(
  probeMemtrace?: (host: string) => Promise<boolean>,
  memtraceHost?: string
): { sync: EnvironmentInfo; probe: () => Promise<boolean> } {
  const cwd = getCwd();
  const configDir = join(homedir(), '.memtrace');
  const configFilePath = join(configDir, 'middleware.json');

  const gitRoot = findUpDir(cwd, (dir) => existsSync(join(dir, '.git')));
  const projectRoot = gitRoot ?? cwd;

  const hasPackageJson = existsSync(join(projectRoot, 'package.json'));
  const hasTsConfig = existsSync(join(projectRoot, 'tsconfig.json'));
  const isGitRepo = gitRoot !== null;

  let workspaceAnchor: string | null = null;

  if (isGitRepo) {
    const memtraceWorkspace = join(projectRoot, '.memtrace-workspace');
    if (existsSync(memtraceWorkspace)) {
      workspaceAnchor = memtraceWorkspace;
    } else {
      const memtraceDir = join(projectRoot, '.memtrace');
      if (existsSync(memtraceDir)) {
        workspaceAnchor = memtraceDir;
      }
    }
  }

  const host = memtraceHost ?? 'http://localhost:8080';

  const sync: EnvironmentInfo = {
    project_root: projectRoot,
    has_package_json: hasPackageJson,
    has_ts_config: hasTsConfig,
    is_git_repo: isGitRepo,
    workspace_anchor: workspaceAnchor,
    memtrace_indexed: false,
    config_file_path: configFilePath,
  };

  const probe = async (): Promise<boolean> => {
    if (probeMemtrace) {
      try {
        const reachable = await probeMemtrace(host);
        return reachable;
      } catch {
        log.warn('memtrace_probe_failed', { host });
        return false;
      }
    }
    return false;
  };

  return { sync, probe };
}

export function readWorkspaceConfig(workspaceAnchor: string): Record<string, unknown> | null {
  const configFile = join(workspaceAnchor, 'config.json');
  if (!existsSync(configFile)) return null;

  try {
    const raw = readFileSync(configFile, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    log.warn('workspace_config_parse_failed', { path: configFile });
    return null;
  }
}
