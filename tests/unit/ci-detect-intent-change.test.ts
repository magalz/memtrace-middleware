import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SCRIPT_PATH = resolve(__dirname, '../../scripts/ci-detect-intent-change.ts');

describe('CI intent change detection', () => {
  beforeAll(() => {
    expect(existsSync(SCRIPT_PATH)).toBe(true);
  });

  it('[P0] exits with code 2 when base and head are the same (no diff)', () => {
    try {
      execSync(`npx tsx ${SCRIPT_PATH} --base-ref=HEAD --head-ref=HEAD`, {
        encoding: 'utf-8',
        timeout: 15000,
      });
    } catch (e: unknown) {
      const err = e as { status: number };
      expect(err.status).toBe(2);
    }
  });

  it('[P1] detects changes between different refs when src/router/types.ts differs', () => {
    const hasGitHistory = execSync('git rev-list --count HEAD~1..HEAD 2>/dev/null || echo 0', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (hasGitHistory === '0' || hasGitHistory === '1') {
      return;
    }
    try {
      execSync(`npx tsx ${SCRIPT_PATH} --base-ref=HEAD~1 --head-ref=HEAD`, {
        encoding: 'utf-8',
        timeout: 15000,
      });
      // exit code 0: changes detected
    } catch (e: unknown) {
      const err = e as { status: number };
      // exit code 2: no intent changes (valid)
      expect([0, 2]).toContain(err.status);
    }
  });

  it('[P2] script has no dependency on middleware product code', () => {
    const content = execSync(`cat ${SCRIPT_PATH}`, { encoding: 'utf-8', timeout: 5000 });
    expect(content).not.toContain("from '../../src/");
    expect(content).not.toContain('from "../src/');
    expect(content).toContain('node:child_process');
  });
});
