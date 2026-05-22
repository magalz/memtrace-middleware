# Deferred Work Log

## Deferred from: implementation of story 7-5-installer-end-to-end (2026-05-22)

- **Expand MCP config injection to support more IDEs**: `inject-mcp-config.mjs` currently only injects Memtrace MCP server config for Claude Desktop (`--mode claude`) and OpenCode (`--mode opencode`). IDEs like Cursor (`.cursor/mcp.json`), Gemini CLI, GitHub Copilot, Windsurf, and others use different config paths and schemas. This was deferred to keep story 7.5 focused on the core installer overhaul. Future story: "7.6 — Multi-IDE MCP config injection". See `_bmad/scripts/memtrace/inject-mcp-config.mjs` for current implementation.

## Deferred from: code review of 7-4-adapter-scripts-smoke-test (2026-05-22)

- Incomplete error checking in adapter list_repos test — Test doesn't inspect stderr when exit code is 0. Checking stderr would couple the test to the adapter's logging implementation, adding maintenance burden. Deferred, pre-existing pattern concern. [`_bmad/scripts/memtrace/smoke-test.mjs:45-76`]
- Missing Test Coverage Justification in spec — Spec file lacks formal Test Coverage Justification table. Not applicable because blast radius was zero code symbols (package.json only). Deferred, spec template gap.
- Missing Mathematical Quality Gate Output in spec — Spec file lacks QA gate JSON output. Not applicable because no code symbols were modified. Deferred, spec template gap.

## Deferred from: code review of story 6-1-architect-readiness-validator-structural-context (2026-05-21)

- No timeout/retry specification in step instructions — Pre-existing pattern. The adapter handles timeouts internally. Step instructions delegate to the adapter which already has this covered.
- Contradictory guidance on graph data trustworthiness — By design: the feature is advisory. Mitigated by freshness check patch.
- Persistent fact conflates adapter subprocess with MCP tool execution — Pre-existing architectural decision. Both usage modes are valid for different query types.
- `find_api_endpoints` filter unspecified — Pre-existing: the executing agent will determine appropriate filters based on context.

## Deferred from: code review of story 4-2 (2026-05-20)

- W1: No concurrency guard for simultaneous `npm run memtrace:restart` invocations from multiple agents. If two agents trigger recovery concurrently, the second agent's `taskkill /im memtrace.exe /t` can kill the first agent's verification spawn. Worth adding a PID-file lock or mutex in a future hardening story. [memtrace-restart.mjs]

## Deferred from: code review of story 6-5-pm-technical-debt-analysis (2026-05-22)

- Inconsistent `top_n` values across files — PM agent persistent fact uses `top_n=20` while retrospective customize.toml and SKILL.md use `top_n=15`. Deferred as intentional: the PM agent's persistent fact is a general-awareness statement with broader scope; the retrospective implementation uses tighter scope for specific workflow execution.

## Deferred from: code review of story 7-1-file-boundary-audit (2026-05-21)

- Outer workspace assumption — `path.resolve(gitRoot, '..')` assumes parent is outer workspace. Correct for this project structure but may not generalize. Deferred, pre-existing architectural assumption.
- Redundant code in checkBoundary01/02 — nearly identical functions with shared scanning logic. Code style concern, not a bug. Deferred, pre-existing.
- Windows long path handling — no support for paths > 260 characters. Pre-existing Node.js on Windows limitation. Deferred, pre-existing.
- Empty directory handling — empty `.agents/skills/` reported as "not found" instead of "exists but empty". Minor edge case. Deferred, pre-existing.
- CRLF line endings — `split('\n')` leaves trailing `\r` on Windows files. Pre-existing cross-platform concern. Deferred, pre-existing.

## Deferred from: code review of story 5-1-markdown-telemetry-report-generation (2026-05-20)

- Pre-existing formatting changes in test files [test/verify-installer.js:58-61, test/test-inject-mcp-config.js:43-258] — Empty catch blocks and catch-param renames (`err` → `error`) in test files are pre-existing working-tree changes, not from this story. Deferred, pre-existing.

## Deferred from: code review of story 4-1-mcp-timeout-detection (2026-05-20)

- D1: `spawn()` timeout wrapper is no-op — `spawnPromise` resolves synchronously at `resolvePromise()`, making `withTimeout` effectively unused for spawn alone. `handshake()` provides the real timeout. Pre-existing design. [memtrace-adapter.mjs:113-162]
- D2: `sendRequest` stdout listener leak on child death — If child process dies mid-request, the listener on `this.child.stdout` is never removed. Pre-existing, not introduced by this change. [memtrace-adapter.mjs:164-199]
- D3: Batch mode does not emit `TIMEOUT_TOKEN` for timeouts — `runBatchQuery` catch pushes errors to results array without emitting the token. By design (batch outputs JSON aggregations). Out of scope. [memtrace-adapter.mjs:544-548]
- D4: `err.message` on non-Error objects — Line 507 accesses `err.message` directly; string throws produce `ERROR: undefined`. Pre-existing in both old `fail(err.message)` and new inline code. [memtrace-adapter.mjs:507]
- D5: Missing test coverage for edge paths — No tests cover timeout during `--summarize`, `--check-freshness`, serialization failure, or batch mixed success/failure. Out of scope for this story. [memtrace-adapter.test.mjs]
- D6: `TimeoutError instanceof` cross-realm risk — `instanceof TimeoutError` may fail for errors from different modules. Pre-existing pattern; `withTimeout` is in same module scope. [memtrace-adapter.mjs:503]
