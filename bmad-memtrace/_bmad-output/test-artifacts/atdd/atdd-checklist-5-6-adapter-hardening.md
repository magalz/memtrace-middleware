---
stepsCompleted: []
lastStep: ''
lastSaved: '2026-06-02T14:10:00Z'
workflowType: 'testarch-atdd'
storyId: '5.6'
storyKey: '5-6-adapter-hardening'
storyFile: '_bmad-output/implementation-artifacts/5-6-adapter-hardening.md'
atddChecklistPath: '_bmad-output/test-artifacts/atdd-checklist-5-6-adapter-hardening.md'
generatedTestFiles:
  - '_bmad/scripts/memtrace/memtrace-adapter.test.mjs'
  - '_bmad/scripts/memtrace/qa-memtrace.test.mjs'
inputDocuments:
  - '_bmad-output/implementation-artifacts/5-6-adapter-hardening.md'
  - 'docs/qa-workflow.md'
---

# ATDD Checklist - Epic 5, Story 6: Adapter Hardening

**Date:** 2026-06-02
**Author:** Magal
**Primary Test Level:** Unit (Node.js native test runner)

---

## Story Summary

The adapter layer (`_bmad/scripts/memtrace/`) has three hardening deficiencies: child process listener leaks in `McpClient.spawn()`, unsafe `.message` property access on caught errors that may not be Error instances, and tight coupling between the QA gate script and adapter output field names. This story fixes all three to make the adapter robust under edge-case conditions.

**As a** developer
**I want** child process leaks, unsafe error property access, and QA gate coupling resolved
**So that** the adapter layer is robust under edge-case conditions.

---

## Acceptance Criteria

1. **Given** the MCP child process dies mid-request, **When** `sendRequest` or `spawn` listeners are attached to `child.stdout`, **Then** those listeners are properly removed to prevent memory leaks.
2. **Given** a caught error in the adapter is not an Error object (e.g., `null`, `string`, `undefined`), **When** the code accesses `.message`, **Then** `err?.message ?? String(err)` is used instead of direct `.message` access — never throws, never returns `undefined`.
3. **Given** QA gate validation runs (`qa-memtrace.mjs`), **When** adapter output field names change (e.g., `affected_symbols` renamed), **Then** QA gate continues to function correctly — coupling to specific adapter output format is minimized.

---

## Story Integration Metadata

- **Story ID:** `5.6`
- **Story Key:** `5-6-adapter-hardening`
- **Story File:** `_bmad-output/implementation-artifacts/5-6-adapter-hardening.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd-checklist-5-6-adapter-hardening.md`
- **Generated Test Files:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`, `_bmad/scripts/memtrace/qa-memtrace.test.mjs`
- **Test Framework:** Node.js native (`node:test` + `node:assert/strict`)
- **No external test dependencies.**

---

## Red-Phase Test Scaffolds Created

### Unit Tests — AC1: Listener Leak (`memtrace-adapter.test.mjs`)

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` (existing, ~769 lines)

- **Test:** `McpClient spawn error (ENOENT) cleans up stdout data listener`
  - **Status:** RED — `cleanup()` currently does not remove stdout/stderr data listeners
  - **Verifies:** AC1 — that when spawn fails with ENOENT, the `stdout.on('data', ...)` listener is removed
  - **Pattern:** Use `makeMockChild()` to emit `error` before spawn promise resolves, then verify `child.stdout.listenerCount('data') === 0`

- **Test:** `McpClient child process error event mid-request cleans up stdout data listener`
  - **Status:** RED — `sendRequest` error path does not clean up queued request listeners
  - **Verifies:** AC1 — that when child emits `error` mid-request, the stdout data listener is removed
  - **Pattern:** Start spawn, send a request, emit `error` on child, verify stdout listener count

- **Test:** `McpClient shutdown() removes stdout/stderr data listeners`
  - **Status:** GREEN (already correct) — `shutdown()` lines 332-333 cleanup exists
  - **Verifies:** AC1 — existing pattern is correct, no regression

- **Test:** `McpClient kill() removes stdout/stderr data listeners`
  - **Status:** GREEN (already correct) — `kill()` lines 369-370 cleanup exists
  - **Verifies:** AC1 — existing pattern is correct, no regression

### Unit Tests — AC2: Safe `.message` Access (`memtrace-adapter.test.mjs`)

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`

- **Test:** `caught null error in adapter does not throw on .message access`
  - **Status:** RED — current `err.message` would throw `TypeError: Cannot read properties of null`
  - **Verifies:** AC2 — that `err?.message ?? String(err)` handles `null` safely

- **Test:** `caught string error in adapter does not return undefined`
  - **Status:** RED — current `err.message` on string `"some error"` returns `undefined`
  - **Verifies:** AC2 — that `err?.message ?? String(err)` returns the string itself

- **Test:** `caught undefined error defaults to string representation`
  - **Status:** RED — `undefined.message` throws TypeError
  - **Verifies:** AC2 — that `String(undefined)` produces `"undefined"`

### Unit Tests — AC3: QA Gate Normalizer (`qa-memtrace.test.mjs`)

**File:** `_bmad/scripts/memtrace/qa-memtrace.test.mjs` (existing, ~189 lines)

- **Test:** `normalizeBlastData maps affected_symbols to symbols`
  - **Status:** RED — normalizer function does not exist yet
  - **Verifies:** AC3 — normalizer maps `affected_symbols` → `symbols`

- **Test:** `normalizeBlastData handles missing affected_symbols field (falls back to symbols)`
  - **Status:** RED — no normalizer exists
  - **Verifies:** AC3 — decoupling: adapter renames `affected_symbols` → `symbols`, QA still works

- **Test:** `normalizeCoverageData maps module to path and symbols_covered to symbolsCovered`
  - **Status:** RED — no normalizer exists
  - **Verifies:** AC3 — decoupling: adapter renames `module` → `file`, QA still works

- **Test:** `normalizeCoverageData handles missing coverage/modules field (empty fallback)`
  - **Status:** RED — no normalizer exists
  - **Verifies:** AC3 — graceful degradation on malformed output

- **Test:** `compute() uses normalized shapes — adapter format change does not break gate`
  - **Status:** RED — compute() directly accesses raw fields
  - **Verifies:** AC3 — end-to-end: refactored compute() with normalizer survives adapter format evolution

---

## Data Factories Created

### Mock MCP Child Process Factory

**Already exists in test suite** — `makeMockChild()` at `memtrace-adapter.test.mjs:476-494`

**Exports:**
- `makeMockChild()` — returns an EventEmitter with `.stdout` and `.stderr` as `PassThrough` streams
- Used by AC1 tests to simulate child process error events and verify listener cleanup

### QA Blast Data Factory

**Inline in new tests** — Create helper to generate adapter output in current and evolved formats:

```js
function makeBlastData() {
  return {
    affected_symbols: [{ file: 'a.js', name: 'foo', depth: 1 }],
    total_count: 5,
  };
}

function makeEvolvedBlastData() {
  return {
    symbols: [{ file: 'a.js', name: 'foo', depth: 1 }],
    total_affected: 5,
  };
}
```

---

## Fixtures Created

None — this story has no UI components. Tests use only in-process mocks (`EventEmitter`, `PassThrough` streams).

---

## Mock Requirements

### Memtrace Mock Server (`memtrace-mock.mjs`)

**Already exists** — `_bmad/scripts/memtrace/memtrace-mock.mjs` (zero-dependency mock MCP server)

**Environment variables that must continue working after changes:**
- `MEMTRACE_MOCK_PATH` — path to mock server script
- `MEMTRACE_MOCK_FAIL` — simulate server failure
- `MEMTRACE_MOCK_BAD_JSON` — simulate malformed JSON response
- `MEMTRACE_MOCK_DEADLINE_MS` — simulate timeout

**Verification:** All 44 existing adapter tests + 14 QA tests must pass. Mock compatibility is a regression gate.

---

## Required data-testid Attributes

N/A — no UI in this story. The adapter is a CLI tool (ESM `.mjs`).

---

## Implementation Checklist

### Test: `McpClient spawn error cleans up stdout data listener`

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`

**Tasks to make this test pass:**
- [ ] Add `stdout.removeListener('data', this._onStdoutData)` to `cleanup()` closure in `spawn()` (line ~220)
- [ ] Add `stderr.removeListener('data', this._onStderrData)` to same `cleanup()` closure
- [ ] Wrap removes in `try/catch` matching `shutdown()`/`kill()` pattern
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs --test-name-pattern="spawn error"`
- [ ] Test passes (green phase)

**Estimated Effort:** 0.5 hours

---

### Test: `McpClient child process error event mid-request cleans up stdout data listener`

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`

**Tasks to make this test pass:**
- [ ] Same fix as above — this test validates the `cleanup()` closure handles mid-request state correctly
- [ ] Run test: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs --test-name-pattern="mid-request"`
- [ ] Test passes (green phase)

**Estimated Effort:** 0.25 hours

---

### Test: `caught null/string/undefined error does not throw`

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs`

**Tasks to make this test pass:**
- [ ] Replace all `err.message` with `err?.message ?? String(err)` at lines: 150, 188, 203, 278, 609, 649, 661, 700, 757
- [ ] Replace `err.message` with `err?.message` at lines 175, 178 in `qa-memtrace.mjs`
- [ ] Run adapter tests: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs`
- [ ] Test passes (green phase)

**Estimated Effort:** 1.0 hours

---

### Test: `normalizeBlastData maps fields correctly`

**File:** `_bmad/scripts/memtrace/qa-memtrace.test.mjs`

**Tasks to make this test pass:**
- [ ] Create `normalizeBlastData(raw)` function in `qa-memtrace.mjs`
- [ ] Create `normalizeCoverageData(raw)` function in `qa-memtrace.mjs`
- [ ] Refactor `compute()` to consume normalized shapes instead of raw adapter fields
- [ ] Run QA tests: `node _bmad/scripts/memtrace/qa-memtrace.test.mjs`
- [ ] Test passes (green phase)

**Estimated Effort:** 1.5 hours

---

### Verification Tests

**File:** `_bmad/scripts/memtrace/memtrace-adapter.test.mjs` + `qa-memtrace.test.mjs`

**Tasks:**
- [ ] Run all adapter tests: `node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs` — zero failures
- [ ] Run all QA tests: `node _bmad/scripts/memtrace/qa-memtrace.test.mjs` — zero failures
- [ ] E2E smoke: `node _bmad/scripts/memtrace/memtrace-adapter.mjs --query list_repos` — exit 0, valid JSON
- [ ] Grep for bare `.message` on error variables: confirm none remain

**Estimated Effort:** 0.5 hours

---

## Running Tests

```bash
# Run all adapter unit tests (requires MEMTRACE_MOCK_PATH)
node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs

# Run specific test by name pattern
node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs --test-name-pattern="listener"

# Run QA tests (no external deps)
node _bmad/scripts/memtrace/qa-memtrace.test.mjs

# Run adapter end-to-end (requires real Memtrace or mock)
node _bmad/scripts/memtrace/memtrace-adapter.mjs --query list_repos
```

---

## Notes

- **This is the v1 adapter** (`_bmad/scripts/memtrace/`), NOT the memtrace-middleware project.
- **Test framework:** Node.js native (`node:test`) — NOT Vitest.
- **No external test deps:** Tests use `node:fs`, `node:child_process`, `node:events`, `node:stream`, `node:path`.
- **Error handling:** `err?.message ?? String(err)` — project coding standard.
- **Listener cleanup pattern:** Match existing `shutdown()` and `kill()` — `try { x.removeListener(...) } catch (e) {}`.
- **Adapter is ESM `.mjs`** — no TypeScript, no build step.
- Regression gate: All 44 existing adapter tests + 14 QA tests must pass.
- Mock compatibility (MEMTRACE_MOCK_PATH/Fail/BadJson/DeadlineMs) must not break.

---

## Knowledge Base References Applied

This ATDD workflow was informed by:
- Story 5.6 Dev Notes — detailed line-level analysis of all fixes
- Story 5.5 (Empty Query Plan Bypass) — `err?.message ?? String(err)` idiom origin
- Story i-2 (Hermetic MCP Mocking) — mock MCP server patterns
- `qa-workflow.md` — QA-Design phase requirements

---

**Generated by BMad Dev Story (QA-Design Phase)** — 2026-06-02
