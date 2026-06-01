# Deferred Work Log

## Deferred from: code review of i-3-qa-memtrace-fixes (2026-06-01)

- Negative `Partial:N` value causes incorrect coverage slicing (`qa-memtrace.mjs:108`) — `parseInt` result can be negative, bypassing `|| 0` fallback and causing `slice(0, negative)`.
- Symbol key collisions when file/name is null/undefined (`qa-memtrace.mjs:87-89`) — Map silently deduplicates identical keys like `"undefined:undefined"`.
- Floating-point threshold silently truncated by parseInt (`qa-memtrace.mjs:35`) — `65.7` becomes `65` without warning.
- Error object may lack `.message` in catch-all handler (`qa-memtrace.mjs:178`) — non-Error throws produce `"ERROR: undefined"`.
- `Partial:` prefix is case/whitespace-sensitive (`qa-memtrace.mjs:107`) — `"partial:1"` or `" Partial:1"` falls through without counting.
- Temp filenames use Date.now() — collision risk under parallel exec (`qa-memtrace.test.mjs:13-14`).
- `total_count` mismatch warning is stderr-only, not in JSON output (`qa-memtrace.mjs:93`) — consumers parsing stdout won't see the warning.
- Empty file/module path treated as valid key (`qa-memtrace.mjs:98`) — creates keys like `":foo"`.
- Missing-arg test has OR fallback that can mask regressions (`qa-memtrace.test.mjs:141`) — timeout pass-by masks missing-message regression.

## Deferred from: code review of 1-3b-query-decomposition-and-multi-intent-routing (2026-05-28)

- **Tool not in `ARG_KEY_BY_TOOL` defaults to `'query'`** — All 3 MVP tools are mapped. New tools added in Growth phase will need mapping extension — by design. [src/router/plan.ts:47]
- **Passthrough `arguments` may be primitive type** — Unlikely; MCP tools/call always sends objects as arguments. Backend handles gracefully. [src/router/plan.ts:22,32]

---

## Deferred from: code review of 1-3a-intent-classification-engine (2026-05-28)

- **`TOOL_TO_INTENT` is static** — plugin-registered intents don't receive the +4 tool-name bonus. Keyword matching still handles plugin intents; dynamic tool mapping deferred to Growth phase. [src/router/classify.ts:20]
- **`getRegistry()` exposes mutation surface** — `clear()`, `register()`, `reset()` all accessible externally. Intentional per FR4 plugin contract requirement; not a bug. [src/router/classify.ts:96]
- **`JSON.stringify(message)` fallback is unbounded** — MCP JSON-RPC protocol bounds message sizes; not a realistic MVP concern. [src/router/classify.ts:107]
- **AC6 accuracy test is qualitative** — tests verify exact intent_type matches from known inputs, not quantitative >=95% across a corpus. Adequate for MVP; corpus-based testing deferred. [tests/unit/router/classify.test.ts]

---
## Deferred from: code review of 1-1-project-scaffold-and-build-pipeline (2026-05-27)

- Missing JSDoc for public APIs in `src/index.ts` — Barrel file re-exports types, constants, and errors without documentation comments. Deferred, documentation task for later story.

---



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

## Deferred from: code review of story-2-1 (2026-05-28)

- Delimiter collision risk in fusion dedup key — `::` in symbol or file_path names could theoretically cause false merging. Extremely unlikely in practice; fix if ever encountered. [src/fusion/engine.ts:66]
- Empty query plan bypass `partial` flag inconsistency — `BaseAdapter` sets `partial: true` for empty query plans, but `fuse()` returns `partial: false` for empty inputs. Pre-existing; refactor in future story. [src/interface/base-adapter.ts:200]

## Deferred from: code review of 3-1-degradation-state-machine (2026-05-29)

- [Defer] AC2 partial: transition logs missing "affected intents" field in tier_transition log entries [src/degrade/machine.ts:149] � In MVP all 3 intents are core so this has no practical impact. Deferred to future stories when non-core intents are introduced.

