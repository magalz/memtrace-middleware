---
baseline_commit: a4312d8
---

# Story 5.6: Adapter Hardening

Status: review

## Story

As a developer,
I want child process leaks, unsafe error property access, and QA gate coupling resolved,
so that the adapter layer is robust under edge-case conditions.

## Acceptance Criteria

1. **Given** the MCP child process dies mid-request, **When** `sendRequest` or `spawn` listeners are attached to `child.stdout`, **Then** those listeners are properly removed to prevent memory leaks.
2. **Given** a caught error in the adapter is not an Error object (e.g., `null`, `string`, `undefined`), **When** the code accesses `.message`, **Then** `err?.message ?? String(err)` is used instead of direct `.message` access — never throws, never returns `undefined`.
3. **Given** QA gate validation runs (`qa-memtrace.mjs`), **When** adapter output field names change (e.g., `affected_symbols` renamed), **Then** QA gate continues to function correctly — coupling to specific adapter output format is minimized.

## Tasks / Subtasks

- [x] Task 1: Fix child process listener leak in `McpClient.spawn()` (AC: 1)
  - [x] 1.1 Add stdout/stderr data listener removal to `spawn()` cleanup closure
  - [x] 1.2 Add stdout/stderr data listener removal to `sendRequest` error path (if child dies mid-write, the pending listeners stay)
  - [x] 1.3 Verify `shutdown()` and `kill()` already clean up stdout/stderr listeners — document existing pattern is correct
  - [x] 1.4 Add unit test: `McpClient` spawn error (ENOENT) cleans up stdout data listener
  - [x] 1.5 Add unit test: child process `error` event mid-request cleans up stdout data listener

- [x] Task 2: Replace unsafe `.message` access with `err?.message ?? String(err)` (AC: 2)
  - [x] 2.1 Fix all `.message` accesses in `memtrace-adapter.mjs` that are on caught/received errors (lines 150, 188, 203, 278, 609, 649, 661, 700, 757)
  - [x] 2.2 Fix `.message` access in `qa-memtrace.mjs` catch block (line 175, 178)
  - [x] 2.3 Verify tests still pass after replacements (all existing adapter + QA tests)
  - [x] 2.4 Add test: caught non-Error value (e.g., `null`, `"string error"`) does not throw

- [x] Task 3: Decouple QA gate from adapter output field names (AC: 3)
  - [x] 3.1 Add schema-validation layer in `qa-memtrace.mjs` that normalizes adapter output into a well-defined internal shape before `compute()`
  - [x] 3.2 Extract blast-data access into a single normalizer function (so one change site if adapter format evolves)
  - [x] 3.3 Ensure `qa-memtrace.test.mjs` exercises the normalizer with both current and malformed/evolved adapter output shapes
  - [x] 3.4 Verify all existing QA tests pass unmodified after normalization refactor

- [x] Task 4: Verification (AC: all)
  - [x] 4.1 Run adapter test suite: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` — **zero failures**
  - [x] 4.2 Run QA test suite: `node _bmad/scripts/memtrace/qa-memtrace.test.mjs` — **zero failures**
  - [x] 4.3 Run `memtrace-adapter.mjs` end-to-end: `node _bmad/scripts/memtrace/memtrace-adapter.mjs --query list_repos` — returns valid JSON, exit 0
  - [x] 4.4 Verify no `err.message` remains on catch paths (grep for bare `.message` on error variables)

## Dev Notes

### Project Location

- Adapter & QA scripts live at `D:\Repos\bmad-memtrace\_bmad\scripts\memtrace\` — NOT in the memtrace-middleware project.
- Tests use Node.js native test runner (`node:test`), NOT Vitest.
- Adapter test can only run when a **real Memtrace instance is running** (MCP mock path via `MEMTRACE_MOCK_PATH` env).
- QA tests use temp files — no external dependencies.

### AC1: Child Process Listener Leak — Detailed Analysis

**Root cause:** `McpClient.spawn()` at `memtrace-adapter.mjs:166-241` (see lines 220–235).

When `spawn()` sets up the child process, it registers:

```js
// Lines 232-235 — Listeners attached
this.child.on('error', onError);
this.child.on('exit', onExit);
this.child.stdout.on('data', stdoutListener);
this.child.stderr.on('data', stderrListener);
```

But the `cleanup()` closure at line 220 only removes `error` and `exit` listeners:

```js
const cleanup = () => {
  if (this.child) {
    this.child.removeListener('error', onError);
    this.child.removeListener('exit', onExit);
    // MISSING: stdout/stderr data listener removal
  }
};
```

**Impact:** If `onError` fires (ENOENT, spawn failure) or `onExit` fires (crash), the stdout/stderr data listeners remain attached to a dead process. The `McpClient` instance holds references via `this.child` and the bound listener functions, preventing garbage collection. In long-running processes that spawn/teardown many McpClient instances (like CI), this accumulates.

**Fix:** Add to the `cleanup()` closure:

```js
const cleanup = () => {
  if (this.child) {
    this.child.removeListener('error', onError);
    this.child.removeListener('exit', onExit);
    try {
      this.child.stdout.removeListener('data', this._onStdoutData);
    } catch (e) {}
    try {
      this.child.stderr.removeListener('data', this._onStderrData);
    } catch (e) {}
  }
};
```

Note: `shutdown()` (line 332-333) and `kill()` (line 369-370) already clean up stdout/stderr listeners — only `spawn()` is missing this in its error path.

**Secondary concern — `sendRequest` (line 243-264):** If the child stdin write fails (line 249 `catch`), the try/catch rejects but does NOT clean up the queued request from `_activeRequests`. However, the `_activeRequests` entry gets cleaned on `kill()`/`shutdown()`. No additional fix needed here — the reject already happens, and cleanup is handled at lifecycle boundaries.

**Test approach:** Use `makeMockChild()` pattern from existing tests (lines 476-494 in `memtrace-adapter.test.mjs`). Emit `error` on child before `spawn()` resolves, verify stdout listener count is 0 after error.

### AC2: Unsafe `.message` Access — All Locations

**`memtrace-adapter.mjs` — lines to fix:**

| Line | Context                   | Current Code           | Risk                                                                     |
| ---- | ------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| 150  | JSON parse catch          | `${err.message}`       | If JSON.parse throws a non-Error (rare but defensive)                    |
| 188  | Spawn try/catch           | `err.message`          | Caught from `spawn()` which always throws Error — **low risk**           |
| 203  | `onError` cb              | `err.message`          | Node.js `ChildProcess 'error'` event — always Error — **low risk**       |
| 278  | `handshake` catch         | `err.message`          | Caught from `sendRequest` rejection — always Error — **low risk**        |
| 609  | `runFreshnessCheck` catch | `err.message`          | Outer catch can receive anything (kill may throw, etc.) — **HIGH risk**  |
| 649  | Serialize catch           | `serializeErr.message` | `JSON.stringify` — always Error — **low risk**                           |
| 661  | `runSingleQuery` catch    | `err.message`          | Outer catch — can catch `undefined` from `client.kill()` — **HIGH risk** |
| 700  | `runBatchQuery` catch     | `err.message`          | Same as above — **HIGH risk**                                            |
| 757  | Freshness diag catch      | `diagErr.message`      | Outer catch — **HIGH risk**                                              |

**Override fix:** Replace all with `err?.message ?? String(err)`. Even for low-risk cases, the code review standard mandates defensive access.

**`qa-memtrace.mjs` — lines to fix:**

| Line | Context             | Current Code                |
| ---- | ------------------- | --------------------------- |
| 175  | Promise race catch  | `err.message === 'TIMEOUT'` |
| 178  | Default error catch | `err.message`               |

Replace both with `err?.message` for safe comparison.

### AC3: QA Gate Output Coupling — Detailed Analysis

**Current tight coupling** in `qa-memtrace.mjs:compute()` (lines 69-143):

```js
// Direct field access — these MUST match adapter output exactly
blastData.affected_symbols; // array
blastData.total_count; // number
sym.file; // string
sym.name; // string
sym.depth; // number
coverageData.modules; // array
mod.module; // string
mod.coverage; // string
mod.symbols_covered; // array
```

If the adapter changes any of these field names, the QA gate silently breaks (wrong comparison, `undefined` values).

**Fix approach — Normalizer layer:**

Add a `normalizer.mjs` (or static functions in `qa-memtrace.mjs`) that:

1. Defines a canonical internal interface (`NormalizedBlastData`, `NormalizedCoverageData`)
2. Has a single `normalizeBlastData(raw)` function mapping adapter output → internal shape
3. Has a single `normalizeCoverageData(raw)` function mapping adapter output → internal shape
4. `compute()` consumes only normalized shapes

```js
function normalizeBlastData(raw) {
  return {
    symbols: raw?.affected_symbols ?? raw?.symbols ?? [],
    totalCount: raw?.total_count ?? raw?.total_affected ?? raw?.symbols?.length ?? 0,
  };
}

function normalizeCoverageData(raw) {
  return {
    modules: (raw?.modules ?? raw?.coverage?.modules ?? []).map((m) => ({
      path: m?.module ?? m?.file ?? m?.path ?? '',
      coverage: m?.coverage ?? m?.status ?? 'None',
      symbolsCovered: m?.symbols_covered ?? m?.covered_symbols ?? m?.covered ?? [],
    })),
  };
}
```

Then `compute()` uses `data.symbols[i].file` (from normalized shape) instead of `sym.file` (raw adapter format). If adapter renames `affected_symbols` → `dependents`, only the normalizer function changes — `compute()` and tests are untouched.

### Architecture Compliance (Mandatory)

- **This is the v1 adapter, NOT the middleware** — files are `.mjs` (ESM) under `_bmad/scripts/memtrace/`
- **Test framework:** Node.js native (`node:test`) — NOT Vitest. Use `describe`/`it`/`assert` from `node:test` and `node:assert/strict`.
- **No external test deps:** Tests use `node:fs`, `node:child_process`, `node:events`, `node:stream`, `node:path`.
- **Error handling:** Use `err?.message ?? String(err)` — project coding standard from previous reviews.
- **Safe access:** `err?.code` for comparison, never bare `.code`.
- **Listener cleanup pattern:** Match existing `shutdown()` and `kill()` — `try { x.removeListener(...) } catch (e) {}`.
- **Plain JavaScript** — no TypeScript, no build step for adapter.
- **STDOUT is JSON output, STDERR is logging** — adapter convention.

### What Previous Stories Established

**From 5-5 (Empty Query Plan Bypass):**

- `err?.message ?? String(err)` is the mandatory safe-error-access idiom established in Story 5.5 code review patches.
- Test patterns: clean mock setup/teardown, spy isolation, verifying code path guards.
- All existing adapter tests (769 lines) and QA tests (189 lines) must continue passing.

**From 5-4 (Force Tier CLI):**

- Structured JSON output on STDOUT, user-facing messages on STDERR.
- Timeout token pattern (`TIMEOUT_TOKEN`) for upstream detection.
- `McpClient` API stability is critical — public method signatures must not change.

**From 5-3 (Init + Auto-Detection):**

- `memtrace-mock.mjs` provides controllable mock MCP server (via env: `MEMTRACE_MOCK_PATH`, `MEMTRACE_MOCK_DEADLINE_MS`, `MEMTRACE_MOCK_FAIL`, `MEMTRACE_MOCK_BAD_JSON`).
- Integration tests for adapter use `execFile` to spawn adapter as a child process.

**From 5-2 (Memtrace Backend Real):**

- Runtime tool discovery, credential isolation patterns.

**From i-2 (Hermetic MCP Mocking):**

- `memtrace-mock.mjs` zero-dependency mock server, fixture data, deterministic test approach.

### What Must NOT Break

- **`McpClient` public API** — `spawn()`, `sendRequest()`, `handshake()`, `callTool()`, `shutdown()`, `kill()` signatures unchanged.
- **All 44 existing adapter tests** in `memtrace-adapter.test.mjs` (769 lines) must pass.
- **All 14 existing QA tests** in `qa-memtrace.test.mjs` (189 lines) must pass.
- **Adapter CLI behavior** — `--help` exit 0, missing args exit 1, valid queries exit 0 with JSON.
- **Timeout token emission** — `MEMTRACE_MCP_ERROR_TIMEOUT` token must still emit exactly as before.
- **Batch mode** — `--batch` with `--target "a,b"` produces `{ results: [...], total_succeeded, total_failed }`.
- **Mock compatibility** — `MEMTRACE_MOCK_PATH`, `MEMTRACE_MOCK_FAIL`, `MEMTRACE_MOCK_BAD_JSON`, `MEMTRACE_MOCK_DEADLINE_MS` env vars must continue functioning.
- **QA gate threshold logic** — exit 0/1 behavior unchanged, JSON output shape unchanged (add fields ok, rename/remove not ok).

### Error-Handling Data Flow (After Fix)

```
McpClient.spawn()
  → spawn('memtrace', ['mcp'])
  → register stdout/stderr data listeners
  → IF child emits 'error' BEFORE promise resolves
    → cleanup() removes error, exit, stdout, AND stderr listeners  ← FIX
    → reject with human-readable error
  → IF child exits non-zero
    → cleanup() removes all listeners  ← FIX
    → reject

McpClient.sendRequest(method, params)
  → child.stdin.write(request) ← could throw if child dead
  → catch → reject(new Error(...))  ← no listener leak (listeners handled at spawn level)

catch (err) {
  const msg = err?.message ?? String(err);  ← FIX: safe access
  console.error(`ERROR: ${msg}`);
}
```

### References

- Epics: `D:\Repos\bmad-memtrace\_bmad-output\planning-artifacts\epics.md` — Story 5.6 Adapter Hardening (lines 403-423), Epic 5 overview (lines 300-302)
- Source: `_bmad/scripts/memtrace/memtrace-adapter.mjs:166-241` — `McpClient.spawn()` with listener leak
- Source: `_bmad/scripts/memtrace/memtrace-adapter.mjs:220-225` — incomplete `cleanup()` closure
- Source: `_bmad/scripts/memtrace/memtrace-adapter.mjs:332-333, 369-370` — correct listener cleanup in `shutdown()`/`kill()` (reference pattern)
- Source: `_bmad/scripts/memtrace/qa-memtrace.mjs:69-143` — `compute()` with tight adapter-output coupling
- Tests: `_bmad/scripts/memtrace/memtrace-adapter.test.mjs:465-768` — McpClient unit tests (use `makeMockChild()` pattern)
- Tests: `_bmad/scripts/memtrace/qa-memtrace.test.mjs:1-189` — QA gate tests (temp-file + `spawnSync` pattern)
- Previous story: `D:\Repos\bmad-memtrace\_bmad-output\implementation-artifacts\5-5-empty-query-plan-bypass.md` — err?.message ?? String(err) idiom established
- Previous story: `D:\Repos\bmad-memtrace\_bmad-output\implementation-artifacts\i-2-hermetic-mcp-mocking.md` — mock MCP server patterns

## Dev Agent Record

### Agent Model Used

deepseek-v4-pro

### Debug Log References

- AC1: Fixed `cleanup()` closure in `McpClient.spawn()` to remove stdout/stderr data listeners — matching `shutdown()`/`kill()` pattern
- AC2: Replaced 11 unsafe `.message` accesses in `memtrace-adapter.mjs` + 2 in `qa-memtrace.mjs` with `err?.message ?? String(err)`
- AC3: Added `normalizeBlastData()` and `normalizeCoverageData()` normalizer functions to `qa-memtrace.mjs`; refactored `compute()` and `main()` to consume normalized shapes
- Syntax fix: corrected misaligned braces in `runBatchQuery()` catch block

### Completion Notes List

- Task 1: Added stdout/stderr `removeListener` to `cleanup()` with try/catch pattern. `shutdown()` and `kill()` already correct.
- Task 2: All bare `.message` references replaced. Added 4 safe-error-access unit tests. Grep audit confirms zero remaining bare `err.message` in adapter + QA files.
- Task 3: Added normalizer layer with backward-compatible field mapping (`affected_symbols`→`symbols`, `module`→`path`, `symbols_covered`→`symbolsCovered`). Added 4 normalizer integration tests. Removed tight coupling from `compute()`.
- Task 4: All 70 adapter tests pass, 17 QA tests pass, grep audit clean.

### File List

- `_bmad/scripts/memtrace/memtrace-adapter.mjs` (modified) — AC1: listener fix, AC2: safe error access, `err?.code` safety
- `_bmad/scripts/memtrace/qa-memtrace.mjs` (modified) — AC2: safe error access, AC3: normalizer layer + compute refactor
- `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` (modified) — added listener cleanup tests + safe error access tests
- `_bmad/scripts/memtrace/qa-memtrace.test.mjs` (modified) — added normalizer integration tests
- `_bmad-output/test-artifacts/atdd/atdd-checklist-5-6-adapter-hardening.md` (new) — QA-Design ATDD checklist
- `_bmad-output/test-artifacts/test-design/test-design-5-6-adapter-hardening.md` (new) — QA-Design test strategy
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified) — story status updated

### Change Log

- 2026-06-02: AC1 — Added stdout/stderr listener cleanup to McpClient.spawn() cleanup closure
- 2026-06-02: AC2 — Replaced all unsafe .message accesses with err?.message ?? String(err)
- 2026-06-02: AC3 — Added normalizer layer to qa-memtrace.mjs for adapter format decoupling
- 2026-06-02: **Code Review Fixes** — Hardened normalizers (Array.isArray guards, null-element filters, coverage type check, numeric string coercion); added err?.stack to 4 debugLog calls; added numeric string test
