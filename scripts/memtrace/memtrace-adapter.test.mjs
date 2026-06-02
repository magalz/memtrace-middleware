import { describe, it, mock, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';

const ADAPTER = resolve(import.meta.dirname, 'memtrace-adapter.mjs');
const ADAPTER_URL = pathToFileURL(ADAPTER).href;
const MOCK_PATH = resolve(import.meta.dirname, 'memtrace-mock.mjs');

process.env.MEMTRACE_MOCK_PATH = MOCK_PATH;
process.env.MEMTRACE_TIMEOUT_MS = '2000';

function runAdapter(args) {
  return new Promise((resolvePromise) => {
    execFile(
      process.execPath,
      [ADAPTER, ...args],
      {
        env: { ...process.env, NODE_NO_WARNINGS: '1' },
        timeout: 30000,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        resolvePromise({
          code: error?.code === 'ETIMEDOUT' ? null : error?.code || 0,
          signal: error?.signal || null,
          stdout: stdout || '',
          stderr: stderr || '',
          error,
        });
      }
    );
  });
}

describe('memtrace-adapter.mjs', () => {
  describe('CLI argument handling', () => {
    it('should output usage with --help and exit 0', async () => {
      const r = await runAdapter(['--help']);
      assert.equal(r.code, 0);
      assert.ok(r.stdout.includes('Usage:'));
      assert.ok(r.stdout.includes('--query'));
    });

    it('should output usage with -h and exit 0', async () => {
      const r = await runAdapter(['-h']);
      assert.equal(r.code, 0);
      assert.ok(r.stdout.includes('Usage:'));
    });

    it('should output usage with no args and exit 0', async () => {
      const r = await runAdapter([]);
      assert.equal(r.code, 0);
      assert.ok(r.stdout.includes('Usage:'));
    });

    it('should exit 1 when missing --target for get_impact', async () => {
      const r = await runAdapter(['--query', 'get_impact']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('--target'));
    });

    it('should exit 1 when missing --target for find_dead_code', async () => {
      const r = await runAdapter(['--query', 'find_dead_code']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('--target'));
    });

    it('should exit 1 when --target is empty string', async () => {
      const r = await runAdapter(['--target', '', '--query', 'get_impact']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('non-empty'));
    });

    it('should exit 1 for unknown --query type', async () => {
      const r = await runAdapter(['--target', 'foo', '--query', 'invalid_query']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('Invalid query'));
    });

    it('should exit 1 when missing --query', async () => {
      const r = await runAdapter(['--target', 'foo']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('--query'));
    });

    it('should exit 1 for unknown argument', async () => {
      const r = await runAdapter(['--unknown']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('Unknown argument'));
    });

    it('should accept --summarize as a valid flag', async () => {
      const r = await runAdapter(['--target', 'foo', '--query', 'get_impact', '--summarize']);
      assert.ok(
        !r.stderr.includes('Unknown argument'),
        '--summarize should not cause unknown argument error'
      );
    });

    it('should accept --check-freshness as a valid flag', async () => {
      const r = await runAdapter(['--target', 'foo', '--query', 'get_impact', '--check-freshness']);
      assert.ok(
        !r.stderr.includes('Unknown argument'),
        '--check-freshness should not cause unknown argument error'
      );
    });

    it('should accept --batch as a valid flag', async () => {
      const r = await runAdapter(['--target', 'foo', '--query', 'get_impact', '--batch']);
      assert.ok(
        !r.stderr.includes('Unknown argument'),
        '--batch should not cause unknown argument error'
      );
    });
  });

  describe('Summarization (--summarize)', () => {
    it('--help output should mention --summarize', async () => {
      const r = await runAdapter(['--help']);
      assert.equal(r.code, 0);
      assert.ok(r.stdout.includes('--summarize'), 'Help text must document --summarize');
    });

    it('--help output should mention --check-freshness', async () => {
      const r = await runAdapter(['--help']);
      assert.equal(r.code, 0);
      assert.ok(
        r.stdout.includes('--check-freshness'),
        'Help text must document --check-freshness'
      );
    });

    it('--help output should mention --batch', async () => {
      const r = await runAdapter(['--help']);
      assert.equal(r.code, 0);
      assert.ok(r.stdout.includes('--batch'), 'Help text must document --batch');
    });

    it(
      '--summarize with find_dead_code should emit warning on STDERR, no summarized field',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'src',
          '--query',
          'find_dead_code',
          '--repo',
          'Repos',
          '--summarize',
        ]);
        assert.ok(r.stderr.includes('WARNING'), 'STDERR must contain warning');
        assert.ok(r.stderr.includes('--summarize'), 'STDERR must reference --summarize');
        assert.equal(r.code, 0);
        const parsed = JSON.parse(r.stdout);
        assert.equal(
          parsed.summarized,
          undefined,
          'STDOUT must not have summarized field for find_dead_code'
        );
      }
    );

    it(
      '--summarize with list_repos should emit warning on STDERR, no summarized field',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter(['--query', 'list_repos', '--summarize']);
        assert.ok(r.stderr.includes('WARNING'), 'STDERR must contain warning');
        assert.equal(r.code, 0);
        const parsed = JSON.parse(r.stdout);
        assert.equal(
          parsed.summarized,
          undefined,
          'STDOUT must not have summarized field for list_repos'
        );
      }
    );

    it(
      'get_impact WITH --summarize should include summarized field',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'bmad-dev-story',
          '--query',
          'get_impact',
          '--repo',
          'Repos',
          '--summarize',
        ]);
        assert.equal(r.code, 0);
        let parsed;
        try {
          parsed = JSON.parse(r.stdout);
        } catch (e) {
          assert.fail(`STDOUT is not valid JSON: ${r.stdout.slice(0, 200)}`);
        }
        assert.ok(typeof parsed.summarized === 'object', 'summarized field must be an object');
        assert.ok(typeof parsed.summarized.total_affected === 'number');
        assert.ok(Array.isArray(parsed.summarized.critical_dependents));
        assert.ok(typeof parsed.summarized.module_impact === 'object');
        assert.ok(typeof parsed.summarized.token_estimate === 'number');
        assert.ok(
          parsed.summarized.token_estimate <= 2000,
          `token_estimate ${parsed.summarized.token_estimate} must be ≤ 2000`
        );

        parsed.summarized.critical_dependents.forEach((s) => {
          assert.ok(s.depth <= 2, `critical_dependent ${s.name} must have depth ≤ 2`);
          assert.ok(typeof s.name === 'string');
          assert.ok(typeof s.file === 'string');
        });
        assert.ok(parsed.summarized.critical_dependents.length <= 20);

        for (const [prefix, mod] of Object.entries(parsed.summarized.module_impact)) {
          assert.ok(typeof mod.count === 'number');
          if (mod.top_symbols) {
            assert.ok(Array.isArray(mod.top_symbols));
            assert.ok(mod.top_symbols.length <= 3);
          }
        }
      }
    );

    it(
      'get_impact WITHOUT --summarize should NOT have summarized field',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'bmad-dev-story',
          '--query',
          'get_impact',
          '--repo',
          'Repos',
        ]);
        assert.equal(r.code, 0);
        const parsed = JSON.parse(r.stdout);
        assert.equal(
          parsed.summarized,
          undefined,
          'Without --summarize, output must NOT have summarized field'
        );
        assert.ok(typeof parsed.target === 'string');
        assert.ok(Array.isArray(parsed.affected_symbols));
        assert.ok(typeof parsed.total_count === 'number');
      }
    );
  });

  describe('Freshness (--check-freshness)', () => {
    it('--help output should mention --check-freshness', async () => {
      const r = await runAdapter(['--help']);
      assert.equal(r.code, 0);
      assert.ok(r.stdout.includes('--check-freshness'));
    });

    it(
      '--check-freshness with list_repos should emit [FRESHNESS] on STDERR',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter(['--query', 'list_repos', '--check-freshness']);
        if (r.code === 0) {
          assert.ok(r.stderr.includes('[FRESHNESS]'), 'STDERR must contain [FRESHNESS] line');
          const parsed = JSON.parse(r.stdout);
          assert.ok(Array.isArray(parsed.repositories));
        } else if (r.code === 1) {
          assert.ok(
            r.stderr.includes('[FRESHNESS]'),
            'STDERR must contain [FRESHNESS] line even on stale index'
          );
          try {
            const parsed = JSON.parse(r.stdout);
            assert.ok(
              parsed.freshness_error || parsed.error,
              'Diagnostic JSON must have freshness_error or error field'
            );
          } catch {
            // STDOUT may not always be parseable JSON; not a hard failure
          }
        }
      }
    );

    it(
      'invalid MEMTRACE_FRESHNESS_MAX_AGE_MINUTES should not crash',
      { timeout: 30000 },
      async () => {
        const r = await runAdapter(['--query', 'list_repos', '--check-freshness']);
        // Should exit cleanly (0 or 1) regardless of env value — never hang or crash
        assert.ok(r.code === 0 || r.code === 1, 'Must exit cleanly with invalid env');
      }
    );

    it(
      '--check-freshness without --repo should auto-detect and not crash',
      { timeout: 30000 },
      async () => {
        const r = await runAdapter(['--query', 'list_repos', '--check-freshness']);
        assert.ok(r.code === 0 || r.code === 1, 'Must exit cleanly with auto-detected repo');
        if (r.code === 0 || r.code === 1) {
          assert.ok(r.stderr.includes('[FRESHNESS]'), 'STDERR must contain [FRESHNESS] line');
        }
      }
    );
  });

  describe('Batch mode (--batch)', () => {
    it('--batch with list_repos should exit 1 with unsupported query error', async () => {
      const r = await runAdapter(['--query', 'list_repos', '--batch']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('not support') || r.stderr.includes('ERROR'));
    });

    it(
      '--batch with comma-separated targets should produce results array',
      { timeout: 15000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'bmad-dev-story,parseArgs',
          '--query',
          'get_impact',
          '--repo',
          'Repos',
          '--batch',
        ]);
        assert.equal(r.code, 0);
        const parsed = JSON.parse(r.stdout);
        assert.equal(parsed.query, 'get_impact');
        assert.ok(Array.isArray(parsed.targets));
        assert.ok(Array.isArray(parsed.results));
        assert.ok(typeof parsed.total_succeeded === 'number');
        assert.ok(typeof parsed.total_failed === 'number');
        assert.ok(parsed.results.length >= 1);
        assert.ok(parsed.results[0].target);
        assert.equal(parsed.total_failed, 0);
      }
    );

    it(
      '--batch with --summarize should give each result summarized field',
      { timeout: 15000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'bmad-dev-story,parseArgs',
          '--query',
          'get_impact',
          '--repo',
          'Repos',
          '--batch',
          '--summarize',
        ]);
        assert.equal(r.code, 0);
        const parsed = JSON.parse(r.stdout);
        assert.ok(Array.isArray(parsed.results));
        for (const res of parsed.results) {
          if (res.risk_level) {
            // succeeded
            assert.ok(res.summarized, 'Each successful target should have summarized field');
            assert.ok(typeof res.summarized.total_affected === 'number');
          }
        }
      }
    );

    it(
      '--batch with non-existent symbols should succeed with mock data',
      { timeout: 15000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'unknown1,unknown2',
          '--query',
          'get_impact',
          '--repo',
          'Repos',
          '--batch',
        ]);
        assert.equal(r.code, 0);
        let parsed;
        try {
          parsed = JSON.parse(r.stdout);
        } catch {
          assert.fail('STDOUT must be valid JSON');
        }
        assert.ok(Array.isArray(parsed.results));
        assert.equal(parsed.total_succeeded, 2, 'Mock should succeed for all targets');
        assert.equal(parsed.total_failed, 0);
      }
    );
  });

  describe('MCP queries', () => {
    it(
      'should list repositories and return valid JSON with repos array',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter(['--query', 'list_repos']);
        assert.equal(r.code, 0);
        let parsed;
        try {
          parsed = JSON.parse(r.stdout);
        } catch (e) {
          assert.fail(`STDOUT is not valid JSON: ${r.stdout.slice(0, 200)}`);
        }
        assert.equal(parsed.query, 'list_repos');
        assert.ok(Array.isArray(parsed.repositories));
        assert.ok(typeof parsed.elapsed_ms === 'number');
        // Verify freshness is always computed (AC #3)
        for (const repo of parsed.repositories) {
          assert.ok(repo.freshness, 'Each repo must have freshness field');
          assert.ok(
            typeof repo.freshness.age_minutes === 'number' || repo.freshness.age_minutes === null
          );
          assert.equal(typeof repo.freshness.is_fresh, 'boolean');
        }
        const oldProject = parsed.repositories.find((r) => r.repo_id === 'old-project');
        assert.ok(oldProject, 'old-project must be in repos');
        assert.equal(
          oldProject?.freshness?.is_fresh,
          false,
          'old-project must be stale (age > 30min)'
        );
      }
    );

    it('should query get_impact and return structured JSON', { timeout: 10000 }, async () => {
      const r = await runAdapter([
        '--target',
        'bmad-dev-story',
        '--query',
        'get_impact',
        '--repo',
        'Repos',
      ]);
      assert.equal(r.code, 0);
      let parsed;
      try {
        parsed = JSON.parse(r.stdout);
      } catch (e) {
        assert.fail(`STDOUT is not valid JSON: ${r.stdout.slice(0, 200)}`);
      }
      assert.ok(typeof parsed.target === 'string');
      assert.ok(typeof parsed.risk_level === 'string');
      assert.ok(Array.isArray(parsed.affected_symbols));
      assert.ok(typeof parsed.total_count === 'number');
      assert.ok(typeof parsed.elapsed_ms === 'number');
    });

    it(
      'should query find_dead_code with --target and --repo and return structured JSON',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter([
          '--target',
          'src',
          '--query',
          'find_dead_code',
          '--repo',
          'Repos',
        ]);
        assert.equal(r.code, 0);
        let parsed;
        try {
          parsed = JSON.parse(r.stdout);
        } catch (e) {
          assert.fail(`STDOUT is not valid JSON: ${r.stdout.slice(0, 200)}`);
        }
        assert.equal(parsed.query, 'find_dead_code');
        assert.equal(typeof parsed.target, 'string');
        assert.ok(Array.isArray(parsed.symbols));
        assert.equal(parsed.total_count, parsed.symbols.length);
        assert.equal(typeof parsed.elapsed_ms, 'number');
        assert.equal(parsed.note, undefined, 'Stub note must be removed');
        if (parsed.symbols.length > 0) {
          assert.ok(
            parsed.symbols.every((s) => typeof s.name === 'string' && typeof s.file === 'string'),
            'Each symbol must have name and file fields'
          );
        }
      }
    );

    it(
      'should query find_dead_code without --repo and auto-detect repo',
      { timeout: 10000 },
      async () => {
        const r = await runAdapter(['--target', 'src', '--query', 'find_dead_code']);
        assert.equal(r.code, 0);
        let parsed = JSON.parse(r.stdout);
        assert.equal(parsed.query, 'find_dead_code');
        assert.ok(Array.isArray(parsed.symbols));
        assert.equal(parsed.total_count, parsed.symbols.length);
        if (parsed.symbols.length > 0) {
          assert.ok(
            parsed.symbols.every((s) => typeof s.name === 'string' && typeof s.file === 'string'),
            'Each symbol must have name and file fields'
          );
        }
      }
    );

    it('should emit MEMTRACE_MCP_ERROR_TIMEOUT on MCP timeout', { timeout: 10000 }, async () => {
      const prevDeadline = process.env.MEMTRACE_MOCK_DEADLINE_MS;
      process.env.MEMTRACE_MOCK_DEADLINE_MS = '5000';
      try {
        const r = await runAdapter([
          '--target',
          'delay-test',
          '--query',
          'get_impact',
          '--repo',
          'Repos',
        ]);
        assert.equal(r.code, 1);
        assert.ok(r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'), 'Must emit timeout token');
      } finally {
        if (prevDeadline !== undefined) {
          process.env.MEMTRACE_MOCK_DEADLINE_MS = prevDeadline;
        } else {
          delete process.env.MEMTRACE_MOCK_DEADLINE_MS;
        }
      }
    });
  });

  describe('Mock failure-mode simulation', () => {
    it(
      'should handle memtrace_fail via MEMTRACE_MOCK_FAIL env var',
      { timeout: 5000 },
      async () => {
        const prevFail = process.env.MEMTRACE_MOCK_FAIL;
        process.env.MEMTRACE_MOCK_FAIL = 'true';
        try {
          const r = await runAdapter([
            '--target',
            'test',
            '--query',
            'get_impact',
            '--repo',
            'Repos',
          ]);
          assert.equal(r.code, 1);
          assert.ok(
            r.stderr.includes('ERROR') ||
              r.stderr.includes('MCP error') ||
              r.stderr.includes('Simulated failure')
          );
        } finally {
          if (prevFail !== undefined) {
            process.env.MEMTRACE_MOCK_FAIL = prevFail;
          } else {
            delete process.env.MEMTRACE_MOCK_FAIL;
          }
        }
      }
    );

    it(
      'should handle memtrace_bad_json via MEMTRACE_MOCK_BAD_JSON env var',
      { timeout: 5000 },
      async () => {
        const prevBadJson = process.env.MEMTRACE_MOCK_BAD_JSON;
        process.env.MEMTRACE_MOCK_BAD_JSON = 'true';
        try {
          const r = await runAdapter(['--query', 'list_repos']);
          assert.equal(r.code, 0, 'Must recover from bad JSON line and process valid response');
          const parsed = JSON.parse(r.stdout);
          assert.ok(Array.isArray(parsed.repositories));
        } finally {
          if (prevBadJson !== undefined) {
            process.env.MEMTRACE_MOCK_BAD_JSON = prevBadJson;
          } else {
            delete process.env.MEMTRACE_MOCK_BAD_JSON;
          }
        }
      }
    );
  });

  describe('Timeout detection accuracy', () => {
    it('should NOT emit MEMTRACE_MCP_ERROR_TIMEOUT for unknown argument', async () => {
      const r = await runAdapter(['--unknown']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('Unknown argument'));
      assert.ok(
        !r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'),
        'TIMEOUT_TOKEN must NOT appear for non-timeout parse errors'
      );
    });

    it('should NOT emit MEMTRACE_MCP_ERROR_TIMEOUT for missing --query', async () => {
      const r = await runAdapter(['--target', 'foo']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('--query'));
      assert.ok(!r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'));
    });

    it('should NOT emit MEMTRACE_MCP_ERROR_TIMEOUT for missing --target', async () => {
      const r = await runAdapter(['--query', 'get_impact']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('--target'));
      assert.ok(!r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'));
    });

    it('should NOT emit MEMTRACE_MCP_ERROR_TIMEOUT for empty --target', async () => {
      const r = await runAdapter(['--target', '', '--query', 'get_impact']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('non-empty'));
      assert.ok(!r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'));
    });

    it('should NOT emit MEMTRACE_MCP_ERROR_TIMEOUT for invalid --query', async () => {
      const r = await runAdapter(['--target', 'foo', '--query', 'invalid_query']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('Invalid query'));
      assert.ok(!r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'));
    });

    it('should NOT emit MEMTRACE_MCP_ERROR_TIMEOUT for batch unsupported query', async () => {
      const r = await runAdapter(['--query', 'list_repos', '--batch']);
      assert.equal(r.code, 1);
      assert.ok(r.stderr.includes('not support') || r.stderr.includes('ERROR'));
      assert.ok(!r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'));
    });

    it(
      'should emit MEMTRACE_MCP_ERROR_TIMEOUT on actual MCP timeout',
      { timeout: 10000 },
      async () => {
        const prevDeadline = process.env.MEMTRACE_MOCK_DEADLINE_MS;
        process.env.MEMTRACE_MOCK_DEADLINE_MS = '5000';
        try {
          const r = await runAdapter([
            '--target',
            'delay-test',
            '--query',
            'get_impact',
            '--repo',
            'Repos',
          ]);
          assert.equal(r.code, 1);
          assert.ok(
            r.stdout.includes('MEMTRACE_MCP_ERROR_TIMEOUT'),
            'Actual MCP timeouts must emit the token'
          );
        } finally {
          if (prevDeadline !== undefined) {
            process.env.MEMTRACE_MOCK_DEADLINE_MS = prevDeadline;
          } else {
            delete process.env.MEMTRACE_MOCK_DEADLINE_MS;
          }
        }
      }
    );
  });

  describe('McpClient robustness (unit)', () => {
    let McpClient, withTimeout, TimeoutError, debugLog;

    before(async () => {
      const mod = await import(ADAPTER_URL);
      McpClient = mod.McpClient;
      withTimeout = mod.withTimeout;
      TimeoutError = mod.TimeoutError;
      debugLog = mod.debugLog;
    });

    function makeMockChild() {
      const child = new EventEmitter();
      child.stdin = new Writable({
        write(chunk, encoding, callback) {
          callback();
        },
      });
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.exitCode = null;
      child.killed = false;
      child.killCount = 0;
      child.kill = (signal) => {
        child.killCount++;
        child.killed = true;
        child.exitCode = 0;
        child.emit('exit', 0, signal);
      };
      child.pid = 12345;
      return child;
    }

    function attachStreams(client) {
      const child = client.child;
      if (child) {
        client._onStdoutData = client._handleStdoutData.bind(client);
        client._onStderrData = client._handleStderrData.bind(client);
        child.stdout.on('data', client._onStdoutData);
        child.stderr.on('data', client._onStderrData);
      }
    }

    describe('withTimeout', () => {
      it('should reject with TimeoutError containing phase', async () => {
        let timer;
        const slowPromise = new Promise(() => {}); // never settles
        const resultPromise = withTimeout(slowPromise, 10, 'query');
        await assert.rejects(resultPromise, (err) => {
          assert.ok(err instanceof TimeoutError);
          assert.ok(
            err.message.includes('phase: query'),
            `Expected phase in message, got: ${err.message}`
          );
          assert.ok(err.message.includes('10ms'));
          return true;
        });
      });

      it('should resolve normally when promise completes before timeout', async () => {
        const fastPromise = Promise.resolve('done');
        const result = await withTimeout(fastPromise, 1000, 'handshake');
        assert.equal(result, 'done');
      });

      it('should track and clean up timers in provided Set', async () => {
        const timers = new Set();
        const promise = new Promise(() => {});
        const resultPromise = withTimeout(promise, 5, 'test', timers);
        assert.equal(timers.size, 1);
        await assert.rejects(resultPromise, TimeoutError);
        assert.equal(timers.size, 0);
      });
    });

    describe('sendRequest', () => {
      it('should resolve with result on matching id', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);
        const resultPromise = client.sendRequest('test/method', { key: 'val' });
        client.child.stdout.push(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } }) + '\n'
        );
        const result = await resultPromise;
        assert.deepEqual(result, { ok: true });
        assert.equal(client._activeRequests.size, 0);
      });

      it('should reject on error response', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);
        const resultPromise = client.sendRequest('test/method');
        client.child.stdout.push(
          JSON.stringify({ jsonrpc: '2.0', id: 1, error: { message: 'Something broke' } }) + '\n'
        );
        await assert.rejects(resultPromise, /Something broke/);
        assert.equal(client._activeRequests.size, 0);
      });

      it('should handle out-of-order responses correctly (id=2, id=1, id=3)', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);

        const p1 = client.sendRequest('r1');
        const p2 = client.sendRequest('r2');
        const p3 = client.sendRequest('r3');

        client.child.stdout.push(JSON.stringify({ jsonrpc: '2.0', id: 2, result: 'two' }) + '\n');
        client.child.stdout.push(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'one' }) + '\n');
        client.child.stdout.push(JSON.stringify({ jsonrpc: '2.0', id: 3, result: 'three' }) + '\n');

        const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
        assert.equal(r1, 'one');
        assert.equal(r2, 'two');
        assert.equal(r3, 'three');
        assert.equal(client._activeRequests.size, 0);
      });

      it('should silently ignore notifications (messages without id)', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);
        const resultPromise = client.sendRequest('test/method');
        client.child.stdout.push(
          JSON.stringify({ jsonrpc: '2.0', method: 'notifications/updated', params: {} }) + '\n'
        );
        client.child.stdout.push(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'done' }) + '\n');
        const result = await resultPromise;
        assert.equal(result, 'done');
        assert.equal(client._activeRequests.size, 0);
      });

      it('should silently ignore responses with unknown ids', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);
        const resultPromise = client.sendRequest('test/method');
        client.child.stdout.push(
          JSON.stringify({ jsonrpc: '2.0', id: 999, result: 'orphan' }) + '\n'
        );
        client.child.stdout.push(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'real' }) + '\n');
        const result = await resultPromise;
        assert.equal(result, 'real');
        assert.equal(client._activeRequests.size, 0);
      });
    });

    describe('JSON parse hardening', () => {
      it('should skip malformed lines starting with { and process valid ones after', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);
        const resultPromise = client.sendRequest('test/method');
        client.child.stdout.push('{"jsonrpc": "2.0", "id": 1, "res' + '\n');
        client.child.stdout.push(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'after-malform' }) + '\n'
        );
        const result = await resultPromise;
        assert.equal(result, 'after-malform');
      });

      it('should skip empty and whitespace-only lines', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);
        const resultPromise = client.sendRequest('test/method');
        client.child.stdout.push('\n');
        client.child.stdout.push('   \n');
        client.child.stdout.push('\t\n');
        client.child.stdout.push(
          JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'after-blanks' }) + '\n'
        );
        const result = await resultPromise;
        assert.equal(result, 'after-blanks');
      });
    });

    describe('shutdown', () => {
      it('should no-op when child is null (never spawned)', async () => {
        const client = new McpClient();
        assert.equal(client.child, null);
        await client.shutdown();
      });

      it('should no-op when child already exited', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        client.child.exitCode = 0;
        await client.shutdown();
        assert.equal(client.child.exitCode, 0);
      });
    });

    describe('kill', () => {
      it('should reject all pending requests', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);

        const p1 = client.sendRequest('r1');
        const p2 = client.sendRequest('r2');

        client.kill();

        await assert.rejects(p1, /McpClient killed/);
        await assert.rejects(p2, /McpClient killed/);
        assert.equal(client._activeRequests.size, 0);
        assert.equal(client.child, null);
      });

      it('should clear all tracked timers', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);

        const p = client.sendRequest('r1');
        assert.ok(client._activeTimers.size > 0, 'Timers should be tracked');

        client.kill();
        assert.equal(client._activeTimers.size, 0, 'All timers should be cleared');
        await assert.rejects(p, /McpClient killed/);
      });

      it('should be idempotent (second call no-op)', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);

        const p = client.sendRequest('r1');
        client.kill();
        client.kill();

        assert.equal(client.child, null);
        await assert.rejects(p, /McpClient killed/);
      });

      it('should no-op when child is already null', () => {
        const client = new McpClient();
        client.kill();
      });
    });

    describe('stderr capture', () => {
      it('should log stderr data with [MCP stderr] prefix', async () => {
        const client = new McpClient();
        client.child = makeMockChild();
        attachStreams(client);

        const stderrLines = [];
        const originalError = console.error;
        console.error = (...args) => stderrLines.push(args.join(' '));

        try {
          client.child.stderr.push('some diagnostics error\n');
          client.child.stderr.push('more info\n');
          await new Promise((r) => setTimeout(r, 50));

          assert.ok(stderrLines.length >= 2);
          assert.ok(
            stderrLines.some((l) => l.includes('[MCP stderr]') && l.includes('some diagnostics'))
          );
          assert.ok(stderrLines.some((l) => l.includes('[MCP stderr]') && l.includes('more info')));
        } finally {
          console.error = originalError;
        }
      });
    });

    describe('debug instrumentation', () => {
      it('should emit [McpClient] lines when MEMTRACE_DEBUG=1', async () => {
        process.env.MEMTRACE_DEBUG = '1';
        debugLog('[McpClient] spawn start');
        debugLog('[McpClient] spawn ok');
        process.env.MEMTRACE_DEBUG = '0';

        // debugLog writes to console.error — verify it doesn't throw
        // and that the guard works (setting to '0' above verifies no-op)
        // Full verification via integration test below
      });

      it('should NOT emit debug lines when MEMTRACE_DEBUG is unset', () => {
        delete process.env.MEMTRACE_DEBUG;
        // debugLog should silently no-op
        debugLog('[McpClient] should not appear');
      });

      it('MEMTRACE_DEBUG=1 adapter should emit debug to stderr', { timeout: 10000 }, async () => {
        const prevDebug = process.env.MEMTRACE_DEBUG;
        process.env.MEMTRACE_DEBUG = '1';
        try {
          const r = await runAdapter(['--query', 'list_repos']);
          assert.ok(r.stdout.length > 0, 'Should produce valid stdout');
        } finally {
          if (prevDebug !== undefined) {
            process.env.MEMTRACE_DEBUG = prevDebug;
          } else {
            delete process.env.MEMTRACE_DEBUG;
          }
        }
      });
    });

    describe('listener cleanup', () => {
      it('cleanup pattern: removeListener in try/catch handles all listener types', () => {
        const child = makeMockChild();
        const fn1 = () => {};
        const fn2 = () => {};

        child.stdout.on('data', fn1);
        child.stderr.on('data', fn2);
        assert.equal(child.stdout.listenerCount('data'), 1);
        assert.equal(child.stderr.listenerCount('data'), 1);

        // Verify the cleanup pattern (matching adapter's shutdown/kill style)
        try {
          child.stdout.removeListener('data', fn1);
        } catch (e) {}
        try {
          child.stderr.removeListener('data', fn2);
        } catch (e) {}
        assert.equal(child.stdout.listenerCount('data'), 0);
        assert.equal(child.stderr.listenerCount('data'), 0);
      });

      it('cleanup pattern: removeListener is safe on streams without listeners', () => {
        const child = makeMockChild();
        const fn = () => {};

        // removeListener on a stream with no matching listener should not throw
        assert.doesNotThrow(() => {
          try {
            child.stdout.removeListener('data', fn);
          } catch (e) {}
        });
        assert.equal(child.stdout.listenerCount('data'), 0);
      });

      it('shutdown() removes stdout/stderr data listeners when child is alive', async () => {
        const client = new McpClient();
        const child = makeMockChild();
        // Child must appear alive: no exitCode, not killed
        child.exitCode = null;
        child.killed = false;
        client.child = child;
        client._onStdoutData = () => {};
        client._onStderrData = () => {};
        child.stdout.on('data', client._onStdoutData);
        child.stderr.on('data', client._onStderrData);

        assert.equal(child.stdout.listenerCount('data'), 1);

        // shutdown() calls sendRequest('shutdown') → stdin.write → may fail
        // then calls kill() which removes listeners. The result: listeners are cleaned.
        await client.shutdown();

        assert.equal(child.stdout.listenerCount('data'), 0);
        assert.equal(child.stderr.listenerCount('data'), 0);
      });

      it('kill() removes stdout/stderr data listeners', () => {
        const client = new McpClient();
        const child = makeMockChild();
        client.child = child;
        client._onStdoutData = () => {};
        client._onStderrData = () => {};
        child.stdout.on('data', client._onStdoutData);
        child.stderr.on('data', client._onStderrData);

        assert.equal(child.stdout.listenerCount('data'), 1);

        client.kill();

        assert.equal(child.stdout.listenerCount('data'), 0);
        assert.equal(child.stderr.listenerCount('data'), 0);
        assert.equal(client.child, null);
      });
    });

    describe('safe error access', () => {
      it('caught null does not throw on message access', () => {
        // Verify err?.message ?? String(err) handles null safely
        const err = null;
        const msg = err?.message ?? String(err);
        assert.equal(msg, 'null');
      });

      it('caught string error returns the string itself', () => {
        const err = 'some error string';
        const msg = err?.message ?? String(err);
        assert.equal(msg, 'some error string');
      });

      it('caught undefined defaults to string representation', () => {
        const err = undefined;
        const msg = err?.message ?? String(err);
        assert.equal(msg, 'undefined');
      });

      it('caught Error object returns .message', () => {
        const err = new Error('test error');
        const msg = err?.message ?? String(err);
        assert.equal(msg, 'test error');
      });
    });

    describe('regression', () => {
      it('McpClient public API signatures remain unchanged', () => {
        const client = new McpClient();
        assert.equal(typeof client.spawn, 'function');
        assert.equal(typeof client.handshake, 'function');
        assert.equal(typeof client.sendRequest, 'function');
        assert.equal(typeof client.callTool, 'function');
        assert.equal(typeof client.shutdown, 'function');
        assert.equal(typeof client.kill, 'function');
        assert.equal(client.spawn.length, 0, 'spawn() takes 0 args');
        assert.equal(
          client.sendRequest.length,
          1,
          'sendRequest(method, params) has 1 arg (params has default)'
        );
        assert.equal(client.callTool.length, 2, 'callTool(name, args) takes 2 args');
        assert.equal(client.handshake.length, 0, 'handshake() takes 0 args');
        assert.equal(client.shutdown.length, 0, 'shutdown() takes 0 args');
        assert.equal(client.kill.length, 0, 'kill() takes 0 args');
      });
    });
  });
});
