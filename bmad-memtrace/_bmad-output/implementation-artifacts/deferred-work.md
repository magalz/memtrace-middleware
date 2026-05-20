# Deferred Work Log

## Deferred from: code review of story 4-2 (2026-05-20)

- W1: No concurrency guard for simultaneous `npm run memtrace:restart` invocations from multiple agents. If two agents trigger recovery concurrently, the second agent's `taskkill /im memtrace.exe /t` can kill the first agent's verification spawn. Worth adding a PID-file lock or mutex in a future hardening story. [memtrace-restart.mjs]

## Deferred from: code review of story 5-1-markdown-telemetry-report-generation (2026-05-20)

- Pre-existing formatting changes in test files [test/verify-installer.js:58-61, test/test-inject-mcp-config.js:43-258] — Empty catch blocks and catch-param renames (`err` → `error`) in test files are pre-existing working-tree changes, not from this story. Deferred, pre-existing.

## Deferred from: code review of story 4-1-mcp-timeout-detection (2026-05-20)

- D1: `spawn()` timeout wrapper is no-op — `spawnPromise` resolves synchronously at `resolvePromise()`, making `withTimeout` effectively unused for spawn alone. `handshake()` provides the real timeout. Pre-existing design. [memtrace-adapter.mjs:113-162]
- D2: `sendRequest` stdout listener leak on child death — If child process dies mid-request, the listener on `this.child.stdout` is never removed. Pre-existing, not introduced by this change. [memtrace-adapter.mjs:164-199]
- D3: Batch mode does not emit `TIMEOUT_TOKEN` for timeouts — `runBatchQuery` catch pushes errors to results array without emitting the token. By design (batch outputs JSON aggregations). Out of scope. [memtrace-adapter.mjs:544-548]
- D4: `err.message` on non-Error objects — Line 507 accesses `err.message` directly; string throws produce `ERROR: undefined`. Pre-existing in both old `fail(err.message)` and new inline code. [memtrace-adapter.mjs:507]
- D5: Missing test coverage for edge paths — No tests cover timeout during `--summarize`, `--check-freshness`, serialization failure, or batch mixed success/failure. Out of scope for this story. [memtrace-adapter.test.mjs]
- D6: `TimeoutError instanceof` cross-realm risk — `instanceof TimeoutError` may fail for errors from different modules. Pre-existing pattern; `withTimeout` is in same module scope. [memtrace-adapter.mjs:503]
