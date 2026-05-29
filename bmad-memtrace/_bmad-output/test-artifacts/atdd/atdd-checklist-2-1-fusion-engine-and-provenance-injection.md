---
stepsCompleted:
  - step-01-preflight-and-context
  - step-02-generation-mode
  - step-03-test-strategy
  - step-04-generate-tests
  - step-04c-aggregate
  - step-05-validate-and-complete
lastStep: step-05-validate-and-complete
lastSaved: 2026-05-28T18:11:00Z
workflowType: testarch-atdd
storyId: '2.1'
storyKey: 2-1-fusion-engine-and-provenance-injection
storyFile: D:/Repos/bmad-memtrace/_bmad-output/implementation-artifacts/2-1-fusion-engine-and-provenance-injection.md
atddChecklistPath: _bmad-output/test-artifacts/atdd/atdd-checklist-2-1-fusion-engine-and-provenance-injection.md
generatedTestFiles:
  - tests/unit/fusion/engine.test.ts
  - tests/unit/fusion/validate.test.ts
  - tests/contract/engine.pact.test.ts
  - tests/integration/fusion-pipeline.test.ts
inputDocuments:
  - _bmad-output/implementation-artifacts/2-1-fusion-engine-and-provenance-injection.md
  - src/types.ts
  - src/errors.ts
  - tests/helpers/test-utils.ts
  - tests/fixtures/memtrace-mock.ts
---

# ATDD Checklist — Epic 2, Story 2.1: Fusion Engine & Provenance Injection

**Date:** 2026-05-28
**Author:** Magal
**Primary Test Level:** Unit + Contract + Integration

---

## Story Summary

The fusion engine receives multiple parallel Memtrace query results, fuses them into a single ranked, annotated context block, and injects it into the agent's conversation with provenance annotations. Every claim carries a traceable source.

**As a** developer
**I want** the middleware to fuse parallel query results into a ranked, annotated context block with provenance
**So that** the agent sees one clear answer with file paths and line numbers instead of raw JSON

---

## Acceptance Criteria

1. **AC 1** — Multiple parallel Memtrace query results are deduplicated, ranked by centrality, annotated with file paths and line numbers into a single FusedContext
2. **AC 2** — Every injected claim carries provenance annotation `[memtrace: grounded via <query_type> → <symbol> at <file>:<line>]`
3. **AC 3** — Injection occurs before the LLM generates a response (orchestrator timing)
4. **AC 4** — Schema validation rejects fabricated references (non-existent file paths, out-of-bounds line numbers)
5. **AC 5** — Partial query results with timeouts produce partial FusedContext with lower confidence — never drops valid results
6. **AC 6** — Fusion consumes QueryResult from src/types.ts via DI — never imports src/backend/ directly
7. **AC 7** — Unit test: deduplication, ranking, annotation (engine)
8. **AC 8** — Unit test: negative validation rejects fabricated references
9. **AC 9** — Unit test: partial results processing with DegradedStub
10. **AC 10** — Contract test: input/output types match FusedContext contract spec

---

## Story Integration Metadata

- **Story ID:** `2.1`
- **Story Key:** `2-1-fusion-engine-and-provenance-injection`
- **Story File:** `_bmad-output/implementation-artifacts/2-1-fusion-engine-and-provenance-injection.md`
- **Checklist Path:** `_bmad-output/test-artifacts/atdd/atdd-checklist-2-1-fusion-engine-and-provenance-injection.md`
- **Generated Test Files:** `tests/unit/fusion/engine.test.ts`, `tests/unit/fusion/validate.test.ts`, `tests/contract/engine.pact.test.ts`, `tests/integration/fusion-pipeline.test.ts`

---

## Red-Phase Test Scaffolds Created

### Unit Tests: Fusion Engine (16 tests)

**File:** `tests/unit/fusion/engine.test.ts`

- ✅ **[P0]** Deduplicates overlapping symbols across query results — AC 1, 7
  - **Status:** RED — `fuse()` not yet implemented in `src/fusion/engine.ts`
  - **Verifies:** Same symbol from multiple queries → single entry with highest centrality

- ✅ **[P0]** Ranks blocks by centrality descending — AC 1, 7
  - **Status:** RED — `fuse()` not yet implemented
  - **Verifies:** Sorting invariant: high-centrality symbols first

- ✅ **[P0]** Annotates each block with provenance string — AC 2, 7
  - **Status:** RED — provenance generation not yet implemented
  - **Verifies:** Every block has a `[memtrace: grounded via ...]` entry

- ✅ **[P0]** Provenance string matches exact expected format — AC 2, 7
  - **Status:** RED — provenance format not yet implemented
  - **Verifies:** Format: `[memtrace: grounded via <tool> → <symbol> at <file>:<line>]`

- ✅ **[P1]** Partial results with degraded stubs — AC 5, 9
  - **Status:** RED — partial merge logic not yet implemented
  - **Verifies:** `partial: true` flag, valid results preserved, degraded results excluded from blocks

- ✅ **[P2]** All results degraded — AC 5, 9
  - **Status:** RED — edge case not yet handled
  - **Verifies:** `partial: true`, empty blocks

- ✅ **[P2]** Empty results array — AC 5
  - **Status:** RED — edge case not yet handled
  - **Verifies:** `partial: false`, empty blocks

- ✅ **[P1]** Data as array extracts all items — AC 7
  - **Status:** RED — array normalization not yet implemented
  - **Verifies:** Array `data` maps 1:1 to ContextBlocks

- ✅ **[P1]** Data as single object extracts one block — AC 7
  - **Status:** RED — object normalization not yet implemented
  - **Verifies:** Single object `data` produces one ContextBlock

- ✅ **[P2]** Null/undefined/primitive data gracefully skipped — AC 7
  - **Status:** RED — type narrowing not yet implemented
  - **Verifies:** Primitives produce zero blocks, no crash

- ✅ **[P1]** Callers/callees/affected_symbols flatten into ContextBlocks — AC 7
  - **Status:** RED — flatten logic not yet implemented
  - **Verifies:** `get_symbol_context`/`get_impact` nested arrays extract correctly

- ✅ **[P1]** Affected_symbols flattens into ContextBlocks — AC 7
  - **Status:** RED — flatten logic not yet implemented
  - **Verifies:** `get_impact` `affected_symbols` extracts correctly

- ✅ **[P0]** Returns Result<FusedContext> shape — AC 1, 6
  - **Status:** RED — Result<T,E> pattern not yet implemented
  - **Verifies:** `{ ok: true, value } | { ok: false, error }` discriminated union

### Unit Tests: Validation (10 tests)

**File:** `tests/unit/fusion/validate.test.ts`

- ✅ **[P0]** Valid context with all fields correct passes — AC 4, 8
  - **Status:** RED — `validateContext()` not yet implemented in `src/fusion/validate.ts`
  - **Verifies:** Valid FusedContext passes validation unchanged

- ✅ **[P0]** Empty file_path rejected — AC 4, 8
  - **Status:** RED — schema validation not yet implemented
  - **Verifies:** `cause: 'fusion_validation_failed'`, `recoverable: false`

- ✅ **[P0]** end_line < start_line rejected — AC 4, 8
  - **Status:** RED — line boundary validation not yet implemented
  - **Verifies:** Invalid line range triggers rejection

- ✅ **[P0]** Negative start_line rejected — AC 4, 8
  - **Status:** RED — negative line validation not yet implemented
  - **Verifies:** Negative line numbers rejected

- ✅ **[P0]** Negative end_line rejected — AC 4, 8
  - **Status:** RED — negative line validation not yet implemented
  - **Verifies:** Negative line numbers rejected

- ✅ **[P0]** Blank symbol rejected — AC 4, 8
  - **Status:** RED — empty string validation not yet implemented
  - **Verifies:** Empty symbol string rejected

- ✅ **[P1]** Valid context with partial:true passes — AC 4
  - **Status:** RED — partial flag handling not yet implemented
  - **Verifies:** Partial contexts are still valid

- ✅ **[P1]** Multiple blocks — first invalid triggers rejection — AC 4, 8
  - **Status:** RED — multi-block iteration not yet implemented
  - **Verifies:** First invalid block causes rejection, subsequent blocks not checked

- ✅ **[P1]** Returns MiddlewareError with recoverable:false — AC 4
  - **Status:** RED — MiddlewareError envelope not yet wired
  - **Verifies:** Error shape has cause, recoverable, tier, trace_id, suggested_action

- ✅ **[P2]** Zero lines (root-level) passes if end >= start — AC 4
  - **Status:** RED — edge case not yet handled
  - **Verifies:** `start_line: 0, end_line: 0` is valid

### Contract Tests (5 tests)

**File:** `tests/contract/engine.pact.test.ts`

- ✅ **[P0]** FusedContext has blocks, partial, trace_id, provenance keys — AC 10
  - **Status:** RED — FusedContext shape not yet enforced
  - **Verifies:** Output envelope matches type contract

- ✅ **[P0]** Every ContextBlock has correct TypeScript types — AC 10
  - **Status:** RED — ContextBlock shape not yet enforced
  - **Verifies:** Runtime type checks on all ContextBlock fields

- ✅ **[P0]** Regression guard — snapshot stable for known inputs — AC 10
  - **Status:** RED — deterministic behavior not yet implemented
  - **Verifies:** Known input produces expected output shape

- ✅ **[P0]** Returns Result shape — AC 10
  - **Status:** RED — Result<T,E> contract not yet implemented
  - **Verifies:** `ok:true+value` or `ok:false+error` discriminated union

- ✅ **[P1]** Never imports src/backend/ directly — AC 6, 10
  - **Status:** RED — DI boundary not yet enforced
  - **Verifies:** No direct import of backend module

### Integration Tests (4 tests)

**File:** `tests/integration/fusion-pipeline.test.ts`

- ✅ **[P0]** find_code through full pipeline produces provenance — AC 1, 2, 3
  - **Status:** RED — BaseAdapter inline fusion not yet replaced
  - **Verifies:** End-to-end: dispatch → FusedContext with provenance strings

- ✅ **[P1]** get_symbol_context fires multiple queries → merged deduplicated blocks — AC 1, 2, 6
  - **Status:** RED — multi-query fusion not yet wired
  - **Verifies:** Multiple parallel queries produce merged result

- ✅ **[P2]** Partial results with slow tool produces partial:true — AC 5
  - **Status:** RED — partial pipeline handling not yet implemented
  - **Verifies:** Slow tool produces degraded result, partial flag set

- ✅ **[P0]** BaseAdapter imports fuse, not inline assembly — AC 6
  - **Status:** RED — BaseAdapter modifications not yet applied
  - **Verifies:** No inline ContextBlock construction in BaseAdapter

---

## Test Level Strategy

| Level | File | Tests | Covers ACs |
|-------|------|-------|-----------|
| Unit (engine) | `tests/unit/fusion/engine.test.ts` | 13 | AC 1, 2, 5, 7, 9 |
| Unit (validate) | `tests/unit/fusion/validate.test.ts` | 10 | AC 4, 8 |
| Contract | `tests/contract/engine.pact.test.ts` | 5 | AC 6, 10 |
| Integration | `tests/integration/fusion-pipeline.test.ts` | 4 | AC 1, 2, 3, 5, 6 |
| **Total** | | **32** | **10/10 ACs** |

---

## Data Factories Created

None required — test data is constructed inline via `makeResult()` and `makeSymbol()` factory functions defined within each test file, following existing patterns in the test suite.

---

## Fixtures Created

None required — existing `tests/fixtures/memtrace-mock.ts` (`createMockMemtrace`) and `tests/helpers/test-utils.ts` (`buildIntent`, `mockCapabilities`) provide all needed fixtures.

---

## Mock Requirements

### Memtrace Mock (existing)

**File:** `tests/fixtures/memtrace-mock.ts`

Provides `createMockMemtrace({ failureMode, delayMs, slowTools })` — used by integration tests to simulate Memtrace server scenarios (normal, reject, slow tools).

Success and failure responses are already defined in the mock for `memtrace_find_code`, `memtrace_get_symbol_context`, `memtrace_get_impact`.

---

## Implementation Checklist

### Test: engine test suite (16 tests)

**File:** `tests/unit/fusion/engine.test.ts`

**Tasks to make these tests pass:**

- [ ] Implement `fuse()` in `src/fusion/engine.ts` — core dedup/rank/annotate logic
- [ ] Implement data normalization: array, object, primitive handling
- [ ] Implement nested flatten: `.callers[]`, `.callees[]`, `.affected_symbols[]`
- [ ] Implement provenance generation: `[memtrace: grounded via ...]` format
- [ ] Implement `Result<T,E>` return type
- [ ] Run test: `pnpm test -- tests/unit/fusion/engine.test.ts`
- [ ] All 16 tests pass (green phase)

**Estimated Effort:** 2-3 hours

### Test: validate test suite (10 tests)

**File:** `tests/unit/fusion/validate.test.ts`

**Tasks to make these tests pass:**

- [ ] Implement `validateContext()` in `src/fusion/validate.ts`
- [ ] Schema validation: non-empty file_path, symbol, start_line ≤ end_line, non-negative lines
- [ ] Multi-block iteration — first invalid triggers rejection
- [ ] Wire `MiddlewareError` with `cause: 'fusion_validation_failed'`
- [ ] Use `createLogger('fusion')` instead of `console.log`
- [ ] Run test: `pnpm test -- tests/unit/fusion/validate.test.ts`
- [ ] All 10 tests pass (green phase)

**Estimated Effort:** 1-2 hours

### Test: contract test suite (5 tests)

**File:** `tests/contract/engine.pact.test.ts`

**Tasks to make these tests pass:**

- [ ] Implement FusedContext output envelope in `fuse()`
- [ ] Ensure deterministic, stable output for known inputs
- [ ] Enforce DI boundary — no `src/backend/` imports
- [ ] Run test: `pnpm test -- tests/contract/engine.pact.test.ts`
- [ ] All 5 tests pass (green phase)

**Estimated Effort:** 1 hour

### Test: integration test suite (4 tests)

**File:** `tests/integration/fusion-pipeline.test.ts`

**Tasks to make these tests pass:**

- [ ] Replace inline ContextBlock assembly in `src/interface/base-adapter.ts` lines 245-273
- [ ] Import `fuse` from `../fusion/index.js`
- [ ] Wire fuse into `runDispatch()` with error handling
- [ ] Preserve `buildDefaultContext()` provenance format
- [ ] Handle partial results from slow tools
- [ ] Run test: `pnpm test -- tests/integration/fusion-pipeline.test.ts`
- [ ] All 4 tests pass (green phase)

**Estimated Effort:** 1-2 hours

---

## Red-Green-Refactor Workflow

### RED Phase (Complete)

- ✅ All tests written as red-phase scaffolds (active — expecting failure)
- ✅ Fixtures and factories verified — existing infrastructure sufficient
- ✅ Mock requirements documented
- ✅ Implementation checklist created

**Verification:**
- Run `pnpm test` — engine/validate/contract/integration tests will fail until implementation
- All generated tests assert expected behavior

---

### GREEN Phase (DEV Team - Next Steps)

1. Start with engine tests (`tests/unit/fusion/engine.test.ts`) — implement `fuse()` in `src/fusion/engine.ts`
2. Continue with validate tests (`tests/unit/fusion/validate.test.ts`) — implement `validateContext()`
3. Wire barrel exports (`src/fusion/index.ts`, `src/index.ts`)
4. Replace inline fusion in `BaseAdapter`
5. Verify contract tests pass
6. Verify integration tests pass
7. Run `pnpm typecheck`, `pnpm lint`, `pnpm build`

### REFACTOR Phase

- Verify all 32 tests pass
- Review code quality, extract duplications, optimize
- Ensure `Result<T,E>` pattern is consistent throughout
- Verify no `console.log` — all logging through `createLogger`

---

## Running Tests

```bash
# Run all tests (including new fusion scaffolds — will fail until implementation)
pnpm test

# Run specific test file
pnpm test -- tests/unit/fusion/engine.test.ts
pnpm test -- tests/unit/fusion/validate.test.ts
pnpm test -- tests/contract/engine.pact.test.ts
pnpm test -- tests/integration/fusion-pipeline.test.ts
```

---

## Acceptance Criteria Coverage Matrix

| AC | Description | Test Level | Test File(s) | Priority |
|-----|-------------|-----------|-------------|----------|
| 1 | Dedup, rank, annotate | Unit + Integration | engine.test.ts, fusion-pipeline.test.ts | P0 |
| 2 | Provenance annotation | Unit + Integration | engine.test.ts (3 tests), fusion-pipeline.test.ts | P0 |
| 3 | Injection before LLM | Integration | fusion-pipeline.test.ts | P0 |
| 4 | Schema validation | Unit | validate.test.ts (7 tests) | P0 |
| 5 | Partial results | Unit + Integration | engine.test.ts (2 tests), fusion-pipeline.test.ts | P1 |
| 6 | DI compliance | Contract + Integration | engine.pact.test.ts, fusion-pipeline.test.ts | P0 |
| 7 | Embedded engine tests | Unit | engine.test.ts (all) | P0 |
| 8 | Embedded validation tests | Unit | validate.test.ts (all) | P0 |
| 9 | Partial results embedded | Unit | engine.test.ts (2 tests) | P1 |
| 10 | Contract test | Contract | engine.pact.test.ts | P0 |

---

## Notes

- This is a pure backend TypeScript middleware library — no UI, no E2E tests
- Test patterns follow existing test suite conventions (vitest, `[P0]/[P1]/[P2]` tags, Given-When-Then comments)
- Existing fixtures (`createMockMemtrace`, `buildIntent`, `mockCapabilities`) are reused for integration tests
- The story already specifies exact file paths for all test files
- After all test scaffolds pass, run `pnpm typecheck`, `pnpm lint`, `pnpm build` for full compliance

---

**Generated by BMad TEA Agent** — 2026-05-28
