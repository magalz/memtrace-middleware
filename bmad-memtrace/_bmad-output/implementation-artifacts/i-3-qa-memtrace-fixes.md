---
baseline_commit: d93165c
---

# Story I.3: QA Memtrace Fixes — TOCTOU Race, cov Inconsistency, total_count Unused

Status: done

## Story

As the BMad System,
I want the `qa-memtrace.mjs` coverage analyzer to be free of race conditions, subtle variable bugs, and dead input fields,
so that its output is deterministic, consistent, and every input field serves a purpose.

## Acceptance Criteria

1. **Given** the `readJsonFile()` function at `_bmad/scripts/memtrace/qa-memtrace.mjs:58-64`,
   **When** a file is deleted between the `existsSync` check and `readFile` call,
   **Then** the race window is eliminated — `readFile` is called directly and `ENOENT` is caught,
   **And** the error message remains `"File not found: <resolvedPath>"`.

2. **Given** the `compute()` function at `_bmad/scripts/memtrace/qa-memtrace.mjs:88-108`,
   **When** the `Partial:` coverage check runs on line 99,
   **Then** it uses the already-assigned `cov` variable instead of re-reading `mod.coverage || ''`,
   **And** all existing partial-coverage tests continue to pass with identical results.

3. **Given** `blastData.total_count` is validated in `main()` at line 144 but never consumed in `compute()`,
   **When** `compute()` processes blast radius data,
   **Then** it cross-validates that `blastData.total_count === blastData.affected_symbols.length`,
   **And** if they mismatch, it logs a `console.error` warning with both values,
   **And** the output JSON includes a `total_count_reported` field mirroring the input `total_count` value,
   **And** all existing tests continue to pass (fixture `makeBr` already sets `total_count` correctly).

4. **Given** all existing tests in `qa-memtrace.test.mjs` (10 tests),
   **When** `node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs` runs after the fixes,
   **Then** ALL 10 tests pass with zero regressions.

5. **Given** the TOCTOU fix is applied,
   **When** the test for missing file runs (`qa-memtrace.test.mjs` "invalid blast-radius JSON" or similar),
   **Then** the error-handling path reaches the catch block correctly — `existsSync` is no longer the gate,
   **And** a new unit test directly verifies: `readJsonFile` with a path to a file that is deleted between calls throws `File not found`.

6. **Given** the fixes are complete,
   **When** `qa-memtrace.mjs` is run with valid input,
   **Then** the output JSON includes `total_count_reported` alongside `blast_radius_total`, both matching the input `total_count`,
   **And** the elapsed_ms field is accurate (not regressed by the fixes).

## Tasks / Subtasks

- [x] Task 1 (AC: #1, #5): Fix TOCTOU race in `readJsonFile()`
  - [x] 1.1: Remove `existsSync` check (line 60-62)
  - [x] 1.2: Wrap `readFile` + `JSON.parse` in try/catch
  - [x] 1.3: Match `ENOENT` error code (`err.code === 'ENOENT'`) and throw `"File not found: ${resolved}"`
  - [x] 1.4: Re-throw any other error (parse failure, permission, etc.) with its original message
  - [x] 1.5: Remove the now-unused `existsSync` import from line 3
  - [x] 1.6: Add unit test: `readJsonFile` with deleted-file path → throws "File not found"

- [x] Task 2 (AC: #2): Fix `cov` variable inconsistency
  - [x] 2.1: Change line 99 from `(mod.coverage || '').startsWith('Partial:')` to `cov.startsWith('Partial:')`
  - [x] 2.2: Verify all existing partial-coverage tests pass with identical results
  - [x] 2.3: No other code change — `cov` was already correctly assigned on line 91 for all other uses

- [x] Task 3 (AC: #3, #6): Make `total_count` useful
  - [x] 3.1: In `compute()`, add cross-validation: `if (blastData.total_count !== blastSet.size) console.error('WARNING: total_count mismatch: reported=${blastData.total_count}, actual=${blastSet.size}')`
  - [x] 3.2: Add `total_count_reported: blastData.total_count` to the return object
  - [x] 3.3: Verify all existing tests pass — `makeBr` fixtures already set `total_count` matching `symbols.length`
  - [x] 3.4: Add test: mismatched `total_count` (fixture with `total_count: 99` but 1 symbol) → warning logged, output includes both fields

- [x] Task 4 (AC: #4): Regression validation
  - [x] 4.1: Run `node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs` — verify all 10 existing tests pass
  - [x] 4.2: Verify new tests (TOCTOU, total_count mismatch) pass
  - [x] 4.3: Manual smoke test: run `qa-memtrace.mjs` with real blast-radius + test-coverage files, verify output shape unchanged except for new `total_count_reported` field

## Dev Notes

### Context

**Source:** Epic 3 retrospective (2026-05-29), Inter-Epic Action Item #3. After hardening the McpClient (i-1) and making tests hermetic (i-2), the remaining piggyback item is fixing three known issues in `qa-memtrace.mjs`. These are low-effort, isolated fixes on a single file that directly impact QA workflow reliability.

**Purpose:** `qa-memtrace.mjs` is the coverage analyzer used in QA gate reports to verify that affected symbols in a blast radius are covered by tests. Three bugs were identified:

1. **TOCTOU race (line 60-64):** `existsSync()` checks file existence, then `readFile()` reads it. A file deleted between these two calls causes `readFile` to throw `ENOENT` unhandled — the error message is cryptic (`ENOENT: no such file or directory`) instead of the clean `"File not found"` message the existsSync guard intended. Fix: remove existsSync, catch ENOENT from readFile directly.

2. **`cov` variable inconsistency (line 99):** `const cov = mod.coverage || ''` is assigned on line 91. Lines 93-98 use `cov` correctly. But line 99 falls back to `(mod.coverage || '').startsWith('Partial:')` instead of `cov.startsWith('Partial:')`. The behavior is equivalent (both resolve to the same value) but the inconsistency is a maintenance hazard — future changes to the `cov` assignment could diverge from line 99. Fix: use `cov` on line 99.

3. **`total_count` unused:** `main()` validates `blastData.total_count` is a number (line 144-146), but `compute()` never reads it. The field exists in input, is validated, but never influences output or validation. Fix: cross-validate against `affected_symbols.length` and include in output.

### Codebase Context

- **File to modify:** `_bmad/scripts/memtrace/qa-memtrace.mjs` (172 lines, Node.js ESM, zero external deps)
- **Test file:** `_bmad/scripts/memtrace/qa-memtrace.test.mjs` (149 lines, 10 tests)
- **Language:** Node.js ESM (`.mjs`), zero external dependencies, Node.js built-ins only
- **Project root:** `D:\Repos\bmad-memtrace\bmad-memtrace\bmad-memtrace` (per project-context.md)
- **No callers in other files** — `qa-memtrace.mjs` is a standalone script invoked via `node qa-memtrace.mjs --blast-radius ... --test-coverage ...`

### Architecture Compliance

- Zero external dependencies — Node.js built-ins only (`fs`, `fs/promises`, `path`)
- `async/await` exclusively — no `.then()/.catch()` (the `Promise.race` on line 164 is the sole exception, used for timeout)
- `console.error` for diagnostics, `console.log` for JSON output to stdout
- `fail()` function pattern: log to stderr, emit TIMEOUT_TOKEN to stdout, exit
- No TypeScript — plain `.mjs` file
- All existing function signatures must remain unchanged: `parseArgs()`, `fail()`, `readJsonFile()`, `compute()`, `main()`
- JSON output shape must remain backward-compatible (additive field `total_count_reported`, no field removals)

### Critical Constraints

1. **Backward compatibility:** Existing JSON output fields must not change names or types. Only additive changes: `total_count_reported` added to output.
2. **No regression:** All 10 existing tests in `qa-memtrace.test.mjs` must pass.
3. **No new dependencies:** Node.js built-ins only.
4. **Exit codes preserved:** 0 for pass, 1 for fail/error — unchanged.
5. **`fail()` function signature unchanged:** Called from multiple locations in `parseArgs()` and the `main()` catch block.

### Previous Story Intelligence

From i-2-hermetic-mcp-mocking (done, 2026-05-29):
- **Pattern for deterministic tests:** i-2 replaced live Memtrace with mock, making all 62 adapter tests deterministic. The qa-memtrace test suite is already hermetic (no external deps, uses temp files). This story follows the same principle — fixes are validated against the existing hermetic test suite.
- **"Additive, not destructive":** The `total_count_reported` field is added to output without removing existing fields. JSON consumers that ignore unknown fields are unaffected.

From i-1-mcpclient-refactor (done, 2026-05-29):
- **Backward compatibility without API changes:** i-1 refactored McpClient internals while preserving the public API surface. This story does the same — internal fixes only, no CLI flag changes, no output format breakage.
- **Error message preservation:** The "File not found" error message format must stay identical after the TOCTOU fix — callers (tests, CI scripts) may parse this string.

### Key Design Decisions

1. **TOCTOU fix via try/catch, not fs.promises.access.** `readFile` already throws `ENOENT` if the file doesn't exist. Adding a try/catch around the existing `readFile` + `JSON.parse` block is the minimal change. No new imports needed.

2. **`total_count` cross-validation instead of removal.** The validation in `main()` (line 144-146) exists for a reason — malformed blast-radius data should be caught. Rather than removing the validation, we make `compute()` consume the value to verify internal consistency. If `total_count` and `affected_symbols.length` diverge, the data is corrupted and the warning helps diagnose it.

3. **Warning via `console.error`, not exit.** A `total_count` mismatch is a data quality issue, not a fatal error. The coverage computation uses `affected_symbols` (the actual data), so the result is still correct. Emitting a warning surfaces the issue without blocking the pipeline.

### References

- [Source: `_bmad-output/implementation-artifacts/epic-3-retro-2026-05-29.md` — Inter-Epic Action Item #3: "qa-memtrace.mjs fixes — TOCTOU race, cov variable inconsistency, total_count unused"]
- [Source: `_bmad/scripts/memtrace/qa-memtrace.mjs` — Full source (172 lines): `readJsonFile()` at 58-64, `compute()` at 66-134, `main()` at 136-158]
- [Source: `_bmad/scripts/memtrace/qa-memtrace.test.mjs` — 10 tests covering: all-covered, some-uncovered, threshold-met, threshold-fail, empty-blast-radius, no-coverage, partial-coverage, threshold-0, threshold-100, missing-arg]
- [Source: `_bmad-output/implementation-artifacts/i-1-mcpclient-refactor.md` — Backward compat pattern, error message preservation]
- [Source: `_bmad-output/implementation-artifacts/i-2-hermetic-mcp-mocking.md` — Deterministic test pattern, "additive not destructive" principle]
- [Source: `docs/qa-workflow.md` — QA gate report JSON schema reference]
- [Source: `docs/memtrace-pitfalls.md` — Dead code validation flow that uses qa-memtrace output]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

- 2026-06-01: QA-Design Gate (Murat) completed — ATDD scaffolds + test strategy generated
- 2026-06-01: TOCTOU fix applied — removed existsSync, added try/catch for ENOENT
- 2026-06-01: cov fix applied — line 99 now uses cov variable
- 2026-06-01: total_count cross-validation added + total_count_reported in output
- 2026-06-01: 2 new tests added (TOCTOU error handling, total_count mismatch)
- 2026-06-01: All 12 tests pass (10 existing + 2 new), smoke tests verified

### Completion Notes List

- Implemented all 3 bug fixes in `qa-memtrace.mjs`: TOCTOU race eliminated, cov variable inconsistency fixed, total_count now cross-validated and included in output
- Removed unused `existsSync` import
- Added 2 new unit tests to `qa-memtrace.test.mjs` (12 total now)
- All existing 10 tests pass without regression
- Zero new dependencies — Node.js built-ins only

### File List

- `_bmad/scripts/memtrace/qa-memtrace.mjs` (modified — TOCTOU, cov, total_count fixes, Number.isFinite patch)
- `_bmad/scripts/memtrace/qa-memtrace.test.mjs` (modified — 4 new tests added, runScript captures stderr via spawnSync)

### Review Findings

- [x] [Review][Patch] `total_count` validation allows NaN/Infinity through — tighten to `Number.isFinite()` in `main()` [`_bmad/scripts/memtrace/qa-memtrace.mjs:147`]
- [x] [Review][Defer] Negative `Partial:N` value causes incorrect coverage slicing [`_bmad/scripts/memtrace/qa-memtrace.mjs:108`] — deferred, pre-existing
- [x] [Review][Defer] Symbol key collisions when file/name is null/undefined [`_bmad/scripts/memtrace/qa-memtrace.mjs:87-89`] — deferred, pre-existing
- [x] [Review][Defer] Floating-point threshold silently truncated by parseInt [`_bmad/scripts/memtrace/qa-memtrace.mjs:35`] — deferred, pre-existing
- [x] [Review][Defer] Error object may lack `.message` in catch-all handler [`_bmad/scripts/memtrace/qa-memtrace.mjs:178`] — deferred, pre-existing
- [x] [Review][Defer] `Partial:` prefix is case/whitespace-sensitive [`_bmad/scripts/memtrace/qa-memtrace.mjs:107`] — deferred, pre-existing
- [x] [Review][Defer] Temp filenames use Date.now() — collision risk under parallel exec [`_bmad/scripts/memtrace/qa-memtrace.test.mjs:13-14`] — deferred, pre-existing
- [x] [Review][Defer] `total_count` mismatch warning is stderr-only, not in JSON output [`_bmad/scripts/memtrace/qa-memtrace.mjs:93`] — deferred, minor enhancement suggestion
- [x] [Review][Defer] Empty file/module path treated as valid key [`_bmad/scripts/memtrace/qa-memtrace.mjs:98`] — deferred, pre-existing
- [x] [Review][Defer] Missing-arg test has OR fallback that can mask regressions [`_bmad/scripts/memtrace/qa-memtrace.test.mjs:141`] — deferred, pre-existing

### Change Log

- 2026-06-01: QA-Verify (Murat) — test quality scored 72/100, identified 4 coverage gaps
- 2026-06-01: Post-QA-Verify fixes: stderr captured in runScript(), stderr assertion added to mismatch test, elapsed_ms type/range assertions added, total_count absent input test added, empty blast radius + total_count mismatch test added (14 tests total)
- 2026-06-01: Code review — Edge Case Hunter found 12; Acceptance Auditor confirmed all 6 ACs met; Blind Hunter failed (empty)
