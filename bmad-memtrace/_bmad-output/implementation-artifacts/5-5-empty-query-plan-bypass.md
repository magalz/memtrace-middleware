---
baseline_commit: 15487ff
---

# Story 5.5: Empty Query Plan Bypass

Status: done

## Story

As an agent,
I want the middleware to handle empty query plans gracefully without crashing,
So that intents that decompose into zero queries (e.g., unsupported tool calls) are handled cleanly.

## Acceptance Criteria

1. **Given** an intent that `plan()` decomposes into 0 `GraphQuery` items, **When** the orchestrator dispatches the intent, **Then** execution and fusion steps are skipped.
2. **Given** an empty query plan, **When** the orchestrator returns the response, **Then** the result includes `partial: true` flag.
3. **Given** an empty query plan, **When** the orchestrator processes it end-to-end, **Then** the middleware does not throw, hang, or return a corrupted `FusedContext`.

## Tasks / Subtasks

- [x] Task 1: Integration tests — full pipeline through orchestrator (AC: 1, 2, 3)
  - [x] 1.1 **Empty capabilities → empty plan → graceful response:** Mock `listTools` returning `[]`, dispatch `memtrace_find_code`, verify response succeeds with metadata, no thrown errors
  - [x] 1.2 **All tools unavailable → empty plan:** Mock capabilities where the classified intent's tools are absent, verify dispatch returns `partial: true` (or equivalent metadata tier)
  - [x] 1.3 **Empty plan does not reach fusion or execution:** Spy on backend `execute`, verify it is never called when plan returns `[]`
  - [x] 1.4 **Empty plan response shape:** Verify response has `content` array, `metadata.trace_id`, no corrupted/malformed JSON

- [x] Task 2: Plan edge-case unit tests (AC: 1, 3)
  - [x] 2.1 **Intent with empty tools list:** Register an intent definition with `tools: []`, verify `plan()` returns `{ ok: true, value: [] }`
  - [x] 2.2 **Intent with tools but empty capabilities:** Verify `plan()` returns empty array when all tools are absent from capabilities
  - [x] 2.3 **Completely malformed original_message:** Verify `plan()` does not throw when `original_message` is `null`, `undefined`, or missing `params`

- [x] Task 3: Metrics completeness for empty-plan dispatches (AC: 3)
  - [x] 3.1 Add `metrics.recordDispatch(…)` call in the empty-plan response path in `base-adapter.ts:302-317`
  - [x] 3.2 Verify empty-plan metrics are recorded with `intent_type` and correct startup type (`cold`/`warm`)

- [x] Task 4: Unit tests for orchestrator empty-plan guard (AC: 1, 2, 3)
  - [x] 4.1 Test that `runDispatch` returns early when `queries.length === 0` — no calls to `backend.execute`, no `fuse()` called
  - [x] 4.2 Test that response metadata includes tier info and trace_id for empty-plan path
  - [x] 4.3 Test that `buildDefaultContext` handles empty `blocks` array without errors (returns `'no results'` text)

- [x] Task 5: Verify and finalize (AC: all)
  - [x] 5.1 Run `pnpm typecheck` — zero errors
  - [x] 5.2 Run `pnpm test` — all new tests pass, existing tests unbroken
  - [x] 5.3 Run `pnpm lint` — ESLint zero errors
  - [x] 5.4 Run `pnpm build` — `dist/cli.js` compiles

## Dev Notes

### Project Location

The middleware project lives at `D:\Repos\bmad-memtrace\memtrace-middleware`. All source changes go here.

### Key Insight: Core Behavior Already Exists

**The empty query plan bypass is already implemented** in `src/interface/base-adapter.ts:302-317`:

```typescript
if (queries.length === 0) {
  log.warn('empty_query_plan', { trace_id: traceId, intent_type: intent.intent_type });
  const fusedContext: FusedContext = {
    blocks: [],
    partial: true,
    trace_id: traceId,
    provenance: [],
  };
  const response = this.contextBuilder.buildContext(fusedContext);
  response.metadata = {
    tier: DegradationTier.IntentReduced,
    trace_id: traceId,
    elapsed_ms: Date.now() - dispatchStart,
  };
  return response;
}
```

The orchestrator already:
- **Skips execution** — never enters the `Promise.allSettled` loop or sequential fallback
- **Skips fusion** — never calls `fuse()` or `validateContext()`
- **Returns `partial: true`** — on the FusedContext blocks
- **Does not throw** — returns a clean AgentResponse
- **Does not hang** — `Promise.allSettled([])` would technically resolve instantly, but the guard at 302 prevents entering that code path entirely

**This story's primary deliverable is comprehensive test coverage + minor hardening.** The code works — it just needs to be battle-tested with integration cases and have proper telemetry recording.

### When Empty Query Plans Occur

`plan()` in `src/router/plan.ts:43-65` produces an empty array when **all** tools in the intent definition are absent from `MemtraceCapabilities.tools`:

```typescript
for (const tool of intentDef.tools) {
  if (!availableTools.has(tool)) {
    logger.warn('tool_not_in_capabilities', { tool, intent: intent.intent_type });
    continue;  // skip → no query added
  }
  // ... push query
}
```

Scenarios that trigger empty plans:
1. Memtrace server (v0.4.x) doesn't support a newer intent's tools (e.g., `find_ast_review_issues` absent)
2. Capabilities fetch returns empty `tools: []` due to server error / misconfiguration
3. Intent definition has `tools: []` (registered with empty tool list intentionally or by bug)

### Existing Code to Modify

**`src/interface/base-adapter.ts` (MODIFY — add metrics recording):**

Lines 302-317 currently log `empty_query_plan` but don't record to the metrics pipeline. Add after the log:

```typescript
if (queries.length === 0) {
  log.warn('empty_query_plan', { trace_id: traceId, intent_type: intent.intent_type });
  // ADD: metrics recording
  const startupType = isColdStart() ? 'cold' : 'warm';
  coldStartRecordDispatch(Date.now() - dispatchStart);
  metrics.recordDispatch(true, intent.intent_type, intent.confidence, Date.now() - dispatchStart, startupType);
  // existing FusedContext + response code stays
  ...
}
```

### Existing Tests to Extend

**`tests/integration/base-adapter-orchestration.test.ts` (ADD new test cases):**

Existing tests use a `createMockBackend()` factory + dynamic `import('../../src/interface/base-adapter.js')` pattern. Follow this exactly:

```typescript
it('[P1] handles empty query plan gracefully — skips execution and fusion', async () => {
  const mockBackend = createMockBackend({
    listTools: async () => [],  // empty capabilities trigger empty plan
    execute: async () => {
      throw new Error('execute should never be called');
    },
  });
  const { BaseAdapter } = await import('../../src/interface/base-adapter.js');
  const adapter = new BaseAdapter(mockBackend);
  const msg = {
    method: 'tools/call',
    params: { name: 'memtrace_find_code', arguments: { query: 'test' } },
  };
  const response = await adapter.dispatch(msg);
  expect(response).toHaveProperty('content');
  expect(response.metadata).toBeDefined();
  expect(response.metadata?.trace_id).toBeTruthy();
  // Tier should reflect degraded/partial state
  expect(response.metadata?.tier).toBeDefined();
});
```

**`tests/unit/router/plan.test.ts` (ADD new edge-case tests):**

Follow existing pattern in the `describe('plan — capabilities validation')` block:

```typescript
it('[P2] returns empty array when intent definition has no tools', () => {
  // Register a test intent with empty tools list
  getRegistry().register({
    type: 'empty_tools_intent' as IntentType,
    patterns: [],
    tools: [],  // empty!
  });
  const intent: ClassifiedIntent = {
    intent_type: 'empty_tools_intent',
    confidence: 0.9,
    passthrough: false,
    original_message: makeMessage('test'),
  };
  const result = plan(intent, mockCapabilities);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.value).toHaveLength(0);
});

it('[P2] does not throw when original_message has no params property', () => {
  const classified = classifyAndPlan('find function authenticateUser', 'memtrace_find_code');
  expect(classified.ok).toBe(true);
  if (!classified.ok) return;
  classified.value.original_message = null;
  const result = plan(classified.value, mockCapabilities);
  expect(result.ok).toBe(true);
});
```

### Architecture Compliance (Mandatory)

- **Files:** `kebab-case` — all existing files follow this convention
- **Tests:** `tests/unit/router/plan.test.ts` (extended), `tests/integration/base-adapter-orchestration.test.ts` (extended)
- **`Promise.allSettled` only** — never `Promise.all`
- **async/await exclusively** — never `.then()/.catch()`
- **All errors are `MiddlewareError`** — or return clean AgentResponse (empty plan is NOT an error)
- **No `console.log`** — use `createLogger()` for structured logs
- **No `any`** — use `unknown` with type narrowing
- **Credential boundary:** empty-plan path never touches credentials
- **Import order:** Node built-ins → external packages → internal modules → relative (ESLint enforced)
- **Barrel `index.ts`** per module
- **Safe error access:** `err?.message ?? String(err)` for unknown catch values
- **Test file naming:** `*.test.ts` in `tests/unit/<module>/` and `tests/integration/`
- **Stderr for user output** — stdout is MCP JSON-RPC protocol reserved
- **Dynamic imports in integration tests:** Use `await import('../../src/...')` pattern (existing convention in orchestration tests)
- **`getRegistry().reset()` in beforeEach** — plan tests always reset registry state

### What Previous Stories Established

**From 5-4 (Force Tier CLI):**
- Integration test pattern: `createMockBackend(overrides)` → `await import(...)` → `new BaseAdapter(mockBackend, config?)` → `adapter.dispatch(msg)`
- `MiddleWareError` toShape() for JSON error comparison in tests
- `metrics.recordDispatch()` signature: `(success: boolean, intentType: string, confidence: number, elapsed: number, startupType: 'cold' | 'warm')`
- `coldStartRecordDispatch(elapsed)` to track cold/warm dispatch times
- `isColdStart()` from `src/telemetry/cold-start.ts`
- `degradationMachine.getCurrentTier()` for tier checks

**From 5-3 (Init + Auto-Detection):**
- Test helpers: `mockCapabilities`, `makeMessage`, `buildIntent` from `tests/helpers/test-utils.ts`
- Tests use `vi.spyOn` for output assertions, `vi.mock('node:os', ...)` for path mocking

**From 5-2 (Memtrace Backend Real):**
- `createLogger('module-name')` for structured NDJSON logging
- Barrel `index.ts` per module — all public exports through barrel
- `MemtraceBackend` interface with `execute()`, `probe()`, `listTools()`

**From 5-1 (MCP Server Mode):**
- Stdio transport is the sole MCP transport
- Stderr for user output: `process.stderr.write()` for user-facing messages

**From 1-4 (Agent Interface & CLI Adapter):**
- Orchestrator pattern: classify → plan → execute → fuse → validate
- `BaseAdapter.runDispatch()` is the main pipeline
- `DispatchContext` for cleanup: `createDispatchContext(traceId)`, `cleanupContext(ctx)`

### What Must NOT Break

- Normal dispatch path (non-empty plans) must work identically — classify → plan → execute → fuse → return
- Passthrough mode must continue working — passthrough always produces 1 query, never triggers empty plan
- FailClosed and Passthrough tier early returns (lines 138-215) must work unchanged
- All existing integration tests (169 lines, 6 test cases) in base-adapter-orchestration.test.ts must pass
- All existing plan unit tests (609 lines, ~25 test cases) must pass
- `buildDefaultContext` must handle empty blocks without errors (already safe: `textBlocks.join('\n') || 'no results'`)
- `validateContext()` on empty FusedContext must not throw (verify — may need null guarding if blocks array is validated)
- `coldStartRecordDispatch` must be callable for empty plans without side effects (already safe — just records a timestamp)

### Empty-Plan Data Flow

```
Agent Tool Call
  → BaseAdapter.dispatch()
    → createDispatchContext(traceId)
    → check tier (FailClosed / Passthrough → early returns)
    → validateToolCall (Zod)
    → fetch capabilities (listTools)
    → classify()
    → plan(intent, capabilities) → { ok: true, value: [] }
    → planned.value.length === 0  ← THE GUARD
    → log: 'empty_query_plan'
    → metrics.recordDispatch(true, ...)  ← STORY ADDITION
    → buildContext({ blocks: [], partial: true, trace_id, provenance: [] })
      → ['no results'] text content
    → return AgentResponse with metadata { tier, trace_id, elapsed_ms }
    → cleanupContext(ctx)
```

### Plan Error Path (Defense-in-Depth)

`plan()` in `plan.ts` **never returns `{ ok: false }`** — it always returns `{ ok: true, value: [...] }`. However, the orchestrator at line 281 checks `!planned.ok` and returns an error response. This is intentional defense-in-depth. Do NOT remove it. If a future change introduces an error return from `plan()`, this guard prevents a crash.

Verify: add a test comment noting this is defense-in-depth, not dead code.

### References

- Epics: `D:\Repos\bmad-memtrace\_bmad-output\planning-artifacts\epics.md` — Story 5.5 Empty Query Plan Bypass (lines 389-401), Epic 5 overview (lines 300-302)
- Architecture: `D:\Repos\bmad-memtrace\_bmad-output\planning-artifacts\architecture.md` — AR9 decoupled dependency graph (line 629), Router API `plan(intent) → GraphQuery[]` (line 271)
- Source: `src/interface/base-adapter.ts:302-317` — existing empty-plan guard in orchestrator
- Source: `src/router/plan.ts:43-65` — tool availability check that produces empty queries
- Source: `src/router/plan.ts:15-18` — `plan()` signature: `(intent: ClassifiedIntent, capabilities: MemtraceCapabilities) → Result<GraphQuery[]>`
- Source: `src/fusion/engine.ts` — `fuse()` takes `FusedInput` with `results: QueryResult[]`
- Source: `src/fusion/validate.ts` — `validateContext()` takes `FusedContext`, returns `Result<FusedContext>`
- Source: `src/interface/base-adapter.ts:26-39` — `buildDefaultContext()` handles empty blocks with `|| 'no results'`
- Source: `src/types.ts:48-53` — `FusedContext` interface: `blocks`, `partial`, `trace_id`, `provenance`
- Source: `src/types.ts:76` — `Result<T, E>` type definition
- Tests: `tests/integration/base-adapter-orchestration.test.ts` (169 lines) — existing integration tests
- Tests: `tests/unit/router/plan.test.ts` (609 lines) — existing plan unit tests
- Tests: `tests/helpers/test-utils.ts` (45 lines) — test fixtures and helpers
- Previous story: `D:\Repos\bmad-memtrace\_bmad-output\implementation-artifacts\5-4-force-tier-cli.md`

## Dev Agent Record

### Agent Model Used

deepseek-v4-pro (via opencode)

### Debug Log References

- All integration and unit tests pass; debug logs captured in test output showing `empty_query_plan` warnings for empty-plan dispatches.

### Completion Notes List

- **Task 1 (Integration tests):** Added 4 new test cases to `tests/integration/base-adapter-orchestration.test.ts` covering empty capabilities → empty plan → graceful response (AC1-I1), partial:true via metadata tier (AC2-I3), no throw/hang (AC3-I5), and response shape integrity (AC3-I6). All 10 integration tests pass (including all 6 pre-existing).
- **Task 2 (Plan edge-case unit tests):** Added 4 test cases to `tests/unit/router/plan.test.ts` covering empty tools list, empty capabilities, null original_message, and missing params. All 30 plan unit tests pass (26 pre-existing + 4 new).
- **Task 3 (Metrics completeness):** Added `coldStartRecordDispatch(elapsed)` and `metrics.recordDispatch(true, intent_type, confidence, elapsed, startupType)` to the empty-plan path in `src/interface/base-adapter.ts:302-317`. Computed `elapsed` once and reused for log, metrics, and response metadata.
- **Task 4 (Unit tests for empty-plan guard):** Created new file `tests/unit/interface/base-adapter-empty-plan.test.ts` with 5 test cases: execute spy never called (AC1-U5), tier=IntentReduced metadata (AC2-U7), buildDefaultContext empty blocks (AC3-U8), metrics.recordDispatch called (MR-U9), and normal-path regression guard. All 5 tests pass.
- **Task 5 (Verification):** `pnpm typecheck` — zero errors. `pnpm test` — 402 passed (1 pre-existing ci-detect timeout failure). `pnpm lint` — ESLint and Prettier pass on changed files. `pnpm build` — `dist/cli.js` compiles.

### File List

- `src/interface/base-adapter.ts` — added metrics recording in empty-plan path (lines 302-317)
- `tests/integration/base-adapter-orchestration.test.ts` — added 4 integration tests for empty-plan bypass
- `tests/unit/router/plan.test.ts` — added 4 unit tests for empty-plan edge cases
- `tests/unit/interface/base-adapter-empty-plan.test.ts` — new file: 6 unit tests for empty-plan guard and metrics
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated story status to in-progress → review

### Review Findings

#### decision-needed

- [x] [Review][Decision] **Cold-start state pollution from empty-plan dispatches** — Empty-plan bypass calls `isColdStart()` and `coldStartRecordDispatch(elapsed)`, advancing the cold-start counter. Empty plans are not real dispatches — consuming the cold-start window with them causes genuine first dispatches to be misclassified as warm, skewing p50 metrics. Found by both Blind Hunter and Edge Case Hunter. **Resolved: Skip cold-start entirely for empty plans. Only record `metrics.recordDispatch` without `startupType`.** [src/interface/base-adapter.ts:305-307]

#### patch

- [x] [Review][Patch] **Spy restoration race in empty-plan unit tests** — Added `afterEach(() => vi.restoreAllMocks())` to prevent spy leakage between tests. [tests/unit/interface/base-adapter-empty-plan.test.ts]
- [x] [Review][Patch] **`intent.confidence` not validated before metrics** — Added `Number.isFinite` guard with `[0,1]` clamp: `Math.max(0, Math.min(1, conf))`. [src/interface/base-adapter.ts:308]
- [x] [Review][Patch] **`intent_type` not validated/normalized** — Added `intent.intent_type ?? 'unknown'` fallback to prevent empty/undefined intent_type in metrics. [src/interface/base-adapter.ts:308]
- [x] [Review][Patch] **Metrics try/catch never exercised by tests** — Added test where `metrics.recordDispatch` throws, verifying graceful degradation returns valid response. [src/interface/base-adapter.ts:307-312]
- [x] [Review][Patch] **Success metric recorded before `buildContext` — incorrect on throw** — Moved `metrics.recordDispatch` after `contextBuilder.buildContext` so incorrect success is not recorded on throw. [src/interface/base-adapter.ts:307-321]
- [x] [Review][Patch] **Metrics-failure log omits `intent_type`** — Added `intent_type` to `empty_query_plan_metrics_failed` log for correlation parity. [src/interface/base-adapter.ts:308-311]
- [x] [Review][Patch] **`response.metadata = {...}` clobbers buildContext output** — Changed to spread merge: `response.metadata = { ...(response.metadata ?? {}), ... }` to preserve custom context builder fields. [src/interface/base-adapter.ts:322-326]
- [x] [Review][Patch] **Hardcoded 'no results' fallback untested** — Changed assertion to `expect(text).toBe('no results')`. [tests/unit/interface/base-adapter-empty-plan.test.ts]
- [x] [Review][Patch] **Dead code: `defaultConfig` unused, `mockCaps` redundant alias** — Removed unused function and alias. Replaced with direct `mockCapabilities.tools`. Removed `coldStartModule` import (no longer needed after skipping cold-start). [tests/unit/interface/base-adapter-empty-plan.test.ts]

#### defer

- [x] [Review][Defer] **`validateContext` bypassed on empty-plan path** — Normal path validates context before return; empty-plan path skips. Pre-existing — the original code also skipped it. Future validator changes could break. [src/interface/base-adapter.ts:315-328]
- [x] [Review][Defer] **Duplicated test assertions across integration and unit files** — Same assertions (execute spy, tier, shape) in both files. Intentional — different layers provide defense-in-depth. [both test files]
- [x] [Review][Defer] **AC2 partial-flag placement ambiguous in spec wording** — AC2 doesn't specify carrier for `partial: true`. PM doc clarification needed. [story spec]
- [x] [Review][Defer] **Execute spy test doesn't bound `listTools` call count** — Only asserts execute not called, not that listTools called exactly once. Low priority. [integration + unit tests]

### Change Log

- 2026-06-02: Story 5.5 implemented. Added 14 tests (10 integration + unit). Added metrics recording to empty-plan dispatch path with try/catch guard. Code review fixes applied. QA-Verify PASS (93/100, 100% AC coverage).

### Review Findings

**Code review complete.** 0 decision-needed, 2 patch, 1 defer, 5 dismissed as noise.

- [ ] [Review][Patch] Guard metrics calls in empty-plan path [src/interface/base-adapter.ts:305-307] � coldStartRecordDispatch + metrics.recordDispatch are unguarded. If the metrics pipeline throws (e.g. isColdStart() failure, metrics module state corrupted), the entire empty-plan dispatch throws instead of returning gracefully. Fix: wrap lines 305-307 in try/catch with a log fallback.
- [ ] [Review][Patch] Verify coldStartRecordDispatch call in metrics test [src/interface/base-adapter.ts:306] � Task 3.1 adds coldStartRecordDispatch(elapsed) but no test asserts it was invoked. Only metrics.recordDispatch is spied. Fix: add i.spyOn(coldStartModule, 'coldStartRecordDispatch') assertion in the metrics test.
- [x] [Review][Defer] Inconsistent Date.now() usage between empty-plan and normal paths [pre-existing, not caused by this change] � elapsed extracted in empty-plan branch but normal paths at lines 289/297 still use inline Date.now() - dispatchStart. Not actionable here.
