---
baseline_commit: 84f8e26e0861b97e1b5075a6292f007ad57305ed
---

# Story I.1: McpClient Refactor — Robustness Hardening

Status: done

## Story

As the BMad System,
I want the McpClient to handle out-of-order MCP responses, cancel in-flight operations cleanly, and shut down without resource leaks,
so that the adapter is production-grade for CI/CD in Epic 4 and never produces silent resource leaks or response mismatches.

## Acceptance Criteria

1. **Given** the MCP server sends responses in non-sequential order (e.g., response for id=2 arrives before id=1),
   **When** `McpClient.sendRequest()` processes the stdout stream,
   **Then** the response for id=2 is correctly matched and resolved,
   **And** the response for id=1 is correctly matched when it arrives later,
   **And** no response is silently discarded or incorrectly routed to the wrong promise.

2. **Given** `withTimeout(promise, ms)` is called for `spawn()`, `handshake()`, or any `sendRequest()`,
   **When** the timeout fires before the underlying operation completes,
   **Then** the underlying child_process operation is actively cancelled (listeners removed, child.stdin destroyed for pending requests),
   **And** the rejected timeout error includes whether the operation was in `spawn`, `handshake`, or `query` phase for clear diagnostics,
   **And** no stale timers, listeners, or half-resolved promises remain after timeout rejection.

3. **Given** `McpClient.shutdown()` is called,
   **When** the child process is still alive,
   **Then** the shutdown sequence is: `shutdown` MCP request → `stdin.end()` → `child.on('exit')` waits up to 2s → `kill('SIGTERM')` if not exited,
   **And** all stdout/stderr listeners are removed before the promise resolves,
   **And** if the child process is already dead (exit event already fired), `shutdown()` resolves immediately without error.

4. **Given** `McpClient.kill()` is called in an error path,
   **When** any `withTimeout` timers from this client instance are still active,
   **Then** all pending timers are cleared before the child is killed (no `setTimeout` leak),
   **And** child.stdin is ended, stderr/stdout listeners removed, and SIGTERM is sent,
   **And** calling `kill()` on an already-dead client is a no-op (no crash).

5. **Given** the MCP server sends a malformed JSON line (partial JSON, non-JSON text starting with `{`, or binary data),
   **When** `sendRequest()` processes the stdout buffer,
   **Then** the malformed line is logged to stderr with the raw content truncated to 120 chars,
   **And** parsing continues to the next complete line — the malformed line does NOT corrupt or block subsequent valid responses,
   **And** notifications (MCP messages without an `id` field, such as `notifications/*`) are silently consumed without error.

6. **Given** the memtrace child process emits data to stderr,
   **When** `McpClient` is operating,
   **Then** stderr output is captured and logged via `console.error` with `[MCP stderr]` prefix,
   **And** consumer code (callers like `runFreshnessCheck`, `runSingleQuery`, `runBatchQuery`) does not need separate stderr handling.

7. **Given** all existing tests in `memtrace-adapter.test.mjs` run after the refactor,
   **When** `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` executes,
   **Then** ALL existing tests continue to pass with zero regressions,
   **And** any test that previously failed due to MCP response ordering, shutdown race conditions, or timeout leaks now passes consistently.

8. **Given** the refactored `McpClient` with `MEMTRACE_DEBUG=1` environment variable set,
   **When** any operation runs,
   **Then** the client emits structured debug lines to stderr: `[McpClient] <phase> <event>` (phases: `spawn`, `handshake`, `request:<id>`, `shutdown`, `kill`; events: `start`, `ok`, `timeout`, `error`, `listener_cleanup`),
   **And** the debug output includes trace-level detail for every Promise.race cancellation and listener removal.

## Tasks / Subtasks

- [x] Task 1 (AC: #1): Out-of-order response handling in `sendRequest()`
  - [x] 1.1: Replace single-request promise listener with a `Map<id, {resolve, reject}>` active-requests registry
  - [x] 1.2: Move the stdout `data` listener from per-request to a single stream-level listener attached in `spawn()`
  - [x] 1.3: In the stream-level listener, parse each complete line, extract `id`, and dispatch to the correct request promise via the registry
  - [x] 1.4: After resolving/rejecting a request, delete it from the registry map
  - [x] 1.5: Ensure notification messages (no `id` field, `method` starting with `notifications/`) are silently consumed

- [x] Task 2 (AC: #2): Promise.race cancellation hardening
  - [x] 2.1: Add `phase` parameter to `withTimeout(promise, ms, phase)` — `"spawn"`, `"handshake"`, `"query"`
  - [x] 2.2: On timeout, throw `TimeoutError` with `phase` field for diagnostics: `Query timed out after ${ms}ms (phase: ${phase})`
  - [x] 2.3: On timeout in `sendRequest()`, remove the request from the active registry and destroy `child.stdin` for that inflight request (prevents response arriving after timeout from resolving a dead promise)
  - [x] 2.4: On timeout in `spawn()`, ensure `child.on('error')` and `child.on('exit')` handlers are cleaned up
  - [x] 2.5: Verify cleanup: after any timeout, no references to the timed-out promise remain reachable

- [x] Task 3 (AC: #3): Shutdown leak fixes
  - [x] 3.1: Refactor `shutdown()`: send `shutdown` MCP request → `stdin.end()` → wait for `exit` event (2s timeout) → `kill('SIGTERM')` if not exited
  - [x] 3.2: Remove stdout listener in `shutdown()` cleanup (the single stream-level listener from Task 1)
  - [x] 3.3: Remove stderr listener in `shutdown()` cleanup
  - [x] 3.4: Make `shutdown()` a no-op if child process is already null/not spawned (graceful idempotence)
  - [x] 3.5: Make `shutdown()` tolerant of already-exited child: catch errors from `sendRequest('shutdown')` when child is dead

- [x] Task 4 (AC: #4): `kill()` resource cleanup
  - [x] 4.1: Before killing the child, iterate the active-requests registry and reject all pending promises with `Error("McpClient killed")`
  - [x] 4.2: Clear all `withTimeout` timers associated with active promises in-flight
  - [x] 4.3: Remove stdout/stderr listeners from the child
  - [x] 4.4: Call `child.stdin.end()` then `child.kill('SIGTERM')`
  - [x] 4.5: Reset internal state: `this.child = null`, clear registry map
  - [x] 4.6: Make `kill()` a no-op if child is already null (idempotent)

- [x] Task 5 (AC: #5): JSON parse error hardening
  - [x] 5.1: In the stream-level stdout listener, wrap `JSON.parse(line)` in try/catch
  - [x] 5.2: On parse failure, if line starts with `{`, log `WARNING: [McpClient] Malformed JSON (${err.message}): ${line.slice(0, 120)}`
  - [x] 5.3: Skip the malformed line — do not corrupt buffer or block subsequent processing
  - [x] 5.4: Handle empty lines and whitespace-only lines (skip silently)

- [x] Task 6 (AC: #6): Stderr capture
  - [x] 6.1: In `spawn()`, attach a `child.stderr.on('data')` listener that logs each chunk via `console.error('[MCP stderr]', line.trim())`
  - [x] 6.2: Handle multiline stderr chunks: split by `\n` and log each line separately
  - [x] 6.3: Accumulate partial lines across chunks (same buffer pattern as stdout)

- [x] Task 7 (AC: #7): Test regression validation
  - [x] 7.1: Run `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` before starting — record baseline (passing and failing tests)
  - [x] 7.2: Fix any test that fails due to the refactor (the McpClient API must remain backward-compatible: `new McpClient()`, `.spawn()`, `.handshake()`, `.sendRequest()`, `.callTool()`, `.shutdown()`, `.kill()` all unchanged)
  - [x] 7.3: Add unit test for out-of-order response handling (mock stdin/stdout, simulate 3 responses arriving as id=2, id=1, id=3)
  - [x] 7.4: Add unit test for JSON parse hardening (inject a malformed line, verify valid responses after it still resolve)
  - [x] 7.5: Add unit test for `shutdown()` idempotence (call twice, call on never-spawned client)
  - [x] 7.6: Verify all existing integration tests (`MCP queries`, `Batch mode`, `Freshness`, `Summarization`, `Timeout detection`) pass

- [x] Task 8 (AC: #8): Debug instrumentation
  - [x] 8.1: Add `MEMTRACE_DEBUG=1` guard: only emit debug output when env var is set
  - [x] 8.2: Emit `[McpClient] spawn start`, `[McpClient] spawn ok|error`, `[McpClient] handshake start|ok|error`
  - [x] 8.3: Emit `[McpClient] request:<id> start`, `[McpClient] request:<id> ok|timeout|error`
  - [x] 8.4: Emit `[McpClient] shutdown start|ok|error`, `[McpClient] kill listener_cleanup`
  - [x] 8.5: Verify debug output does not leak credentials or API tokens

## Dev Notes

### Context

**Source:** Epic 3 retrospective (2026-05-29), action item #1. Epic 2 retrospective also flagged pre-existing technical debt. The McpClient is the core infrastructure dependency for all Memtrace queries — its robustness directly gates CI/CD reliability in Epic 4.

**Purpose:** The McpClient in `_bmad/scripts/memtrace/memtrace-adapter.mjs` (lines 106-231) is the sole bridge between BMad skills and the Memtrace MCP server. Every query (`get_impact`, `find_dead_code`, `list_repos`, freshness check, batch mode) flows through this client. Four classes of robustness issues were identified across Epics 2 and 3 as the most persistent source of test flakiness and MCP failures.

### Codebase Context

- **File to modify:** `_bmad/scripts/memtrace/memtrace-adapter.mjs` (McpClient at lines 106-231, `withTimeout` at 427-435)
- **Test file:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` (445 lines, 30+ tests)
- **Language:** Node.js ESM (`.mjs`), zero external dependencies, Node.js built-ins only
- **Callers (all in same file):** `runFreshnessCheck()` (line 444), `runSingleQuery()` (line 466), `runBatchQuery()` (line 513), freshness diagnostic in `main()` (line 593)
- **Project root:** The actual code lives at `D:\Repos\bmad-memtrace\bmad-memtrace` (per project-context.md)

### Architecture Compliance

- Zero external dependencies — Node.js built-ins only (`child_process`, `fs`, `path`)
- `async/await` exclusively — no `.then()/.catch()` (though `new Promise` constructors are acceptable for wrapping event emitters)
- `console.error` for diagnostics, `console.log` for JSON output to stdout
- `Promise.race` with `clearTimeout` in `finally` block (current pattern; refactor to use `AbortController` where feasible)
- No TypeScript — plain `.mjs` file
- All existing function signatures must remain unchanged: `McpClient` public API (`constructor()`, `spawn()`, `sendRequest(method, params)`, `handshake()`, `callTool(name, args)`, `shutdown()`, `kill()`) is the contract

### Critical Constraints

1. **Backward compatibility:** The McpClient API signature must NOT change. Every caller in the same file expects `spawn()`, `handshake()`, `callTool()`, `shutdown()`, `kill()` with current signatures.
2. **No regression:** All 30+ existing tests in `memtrace-adapter.test.mjs` must pass after the refactor.
3. **No new dependencies:** Node.js built-ins only.
4. **Cross-platform:** Windows (`win32`) path handling and process spawning (`shell: true, windowsHide: true`) must be preserved.

### Previous Story Intelligence

This is the first story in epic-inter — no previous inter-epic stories exist. However, relevant patterns from Epics 2 and 3:

- **Epic 2 pattern:** "Never trust external API shape" — null/undefined guards on all external input. Applied here: MCP responses must be defensively validated before dispatching.
- **Epic 3 pattern:** "Moving enforcement from prompts to code is always worth it" — freshness check, anti-Promise.all, token budget all moved to code. Applied here: robustness enforcement moves from "careful error handling" to structural guarantees.
- **Epic 3 pattern:** "Additive, not destructive" — backward compat by adding fields/flags without removing behavior. Applied here: the McpClient API surface stays identical; internals are refactored but the contract is preserved.

### Git Intelligence

- Recent commits show the adapter underwent significant hardening in Epic 3 (stories 3.1-3.4), with ~41 review patches
- The `batch` mode and `--check-freshness` were the most recent additions (commit `84f8e26`)
- Test file has 30+ tests proving the adapter's external behavior is well-characterized

### Key Design Decisions

1. **Active-request registry** (`Map<id, {resolve, reject}>`): The out-of-order fix. Replaces the per-request listener pattern with a single stream-level listener that dispatches to the correct promise by id. This naturally supports out-of-order delivery and is the standard MCP client pattern (mirrors `@modelcontextprotocol/sdk` client design).

2. **Single stdout listener:** Only one `child.stdout.on('data')` listener, created in `spawn()`, removed in `shutdown()` or `kill()`. This eliminates the listener leak risk from per-request listeners that may not all be removed.

3. **Phase-tagged timeouts:** The `phase` parameter on `withTimeout()` enables precise diagnostics. When combined with the `MEMTRACE_DEBUG=1` guard, failed operations can be traced to the exact phase where they timed out.

4. **Stderr capture:** Currently a complete no-op. Capturing stderr with `[MCP stderr]` prefix surfaces Memtrace server diagnostics that currently go to `/dev/null`.

### References

- [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-05-29.md` — Inter-Epic Action Items]
- [Source: `_bmad/scripts/memtrace/memtrace-adapter.mjs` — McpClient class lines 106-231]
- [Source: `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` — Full test suite]
- [Source: `_bmad-output/implementation-artifacts/epic-2-retro-2026-05-29.md` — Technical Debt deferred items]

## Dev Agent Record

### Agent Model Used

deepseek-v4-pro (via opencode CLI)

### Debug Log References

- Baseline test run: 39 tests, 0 failures (2026-05-29, commit 84f8e26)
- Final test run: 60 tests, 0 failures (39 existing + 21 new)
- Full regression suite passed with zero regressions

### Completion Notes List

- Refactored McpClient class in `_bmad/scripts/memtrace/memtrace-adapter.mjs`:
  - Added `Map<id, {resolve, reject}>` active-requests registry for out-of-order response handling
  - Replaced per-request `child.stdout.on('data')` listeners with single stream-level listener in `_handleStdoutData()`
  - Notifications (messages without `id` field) are silently consumed
  - Unknown response ids are silently ignored (no matching active request)
  - Malformed JSON lines are logged (truncated to 120 chars) and skipped — subsequent valid responses remain unaffected
  - Empty and whitespace-only lines are skipped silently

- Hardened `withTimeout()`:
  - Added optional `phase` parameter for diagnostic timeout errors
  - Added optional `timers` Set parameter for timer lifecycle tracking
  - TimeoutError messages now include phase info: `Query timed out after ${ms}ms (phase: ${phase})`

- Hardened `shutdown()`:
  - Ordered sequence: send shutdown request → stdin.end() → wait exit (2s) → SIGTERM
  - Removes stdout and stderr listeners on cleanup
  - Idempotent: no-op if child is null or already exited

- Hardened `kill()`:
  - Rejects all pending active requests with `Error("McpClient killed")`
  - Clears all tracked `setTimeout` timers
  - Removes stdout/stderr listeners before kill
  - Resets `this.child = null`, clears registry and timers
  - Idempotent: no-op if child is already null

- Added stderr capture: `child.stderr.on('data')` logs via `console.error('[MCP stderr]', ...)`

- Added `MEMTRACE_DEBUG=1` debug instrumentation: `[McpClient] <phase> <event>` lines

- Extracted `_handleStdoutData()` and `_handleStderrData()` as class methods for testability

- Added 21 new unit tests covering: withTimeout phase errors, sendRequest dispatch, out-of-order responses, notification handling, unknown id handling, JSON parse hardening, shutdown idempotence, kill() resource cleanup, stderr capture, debug instrumentation, and API signature regression

- All existing 39 integration tests continue to pass with zero regressions

- Exported `McpClient`, `withTimeout`, `TimeoutError`, `debugLog` from adapter for unit testing

- Added `isMainModule` guard to prevent `main()` execution when imported

### File List

- `_bmad/scripts/memtrace/memtrace-adapter.mjs` — McpClient class (lines 112-289), withTimeout (lines 528-541), exports
- `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` — 21 new unit tests (McpClient robustness section)
- `_bmad-output/implementation-artifacts/i-1-mcpclient-refactor.md` — Story file (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Sprint status update
- `_bmad-output/test-artifacts/atdd/atdd-checklist-i-1-mcpclient-refactor.md` — QA-Design output
- `_bmad-output/test-artifacts/test-design/test-design-i-1-mcpclient-refactor.md` — Test strategy output

## Change Log

- 2026-05-29: McpClient refactored with active-request registry, stream-level listeners, timeout hardening, shutdown/kill idempotence, JSON parse hardening, stderr capture, debug instrumentation. 21 new unit tests. Zero regressions.
