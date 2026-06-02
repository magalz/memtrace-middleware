# Story 6.3: Test Architect Coverage Gap Analysis

Status: done

## Story

As the Test Architect Agent,
I want to cross-reference test files against graph symbols,
so that I can mathematically identify missing test coverage.

## Acceptance Criteria

1. **Given** a target module being evaluated for test coverage,
   **When** the Test Architect agent executes the coverage traceability workflow (`bmad-testarch-trace`),
   **Then** the workflow queries the Memtrace graph to discover exported functional symbols in the module
   **And** cross-references test files against those symbols
   **And** produces a structural coverage report highlighting any exported symbols without corresponding test coverage.

2. **Given** Memtrace is indexed and available for the project repository,
   **When** the Test Architect launches (via `bmad-tea` persona or direct `bmad-testarch-trace` invocation),
   **Then** the persona is aware of Memtrace structural coverage capabilities
   **And** the trace workflow includes structural symbol-to-test mapping as a new coverage dimension
   **And** the traceability matrix template includes a structural coverage section.

3. **Given** Memtrace is NOT available (unindexed, server down, timeout),
   **When** the trace workflow runs,
   **Then** the structural coverage dimension is skipped gracefully
   **And** the workflow continues with requirements-based coverage analysis only
   **And** a diagnostic note indicates structural verification was unavailable.

4. **Given** the trace workflow's coverage heuristics step (Step 4),
   **When** gap analysis runs,
   **Then** structural gaps (exported symbols without tests) are included alongside existing heuristic gaps (endpoint, auth, error-path)
   **And** structural gaps are prioritized as HIGH severity for uncovered exported symbols
   **And** MEDIUM severity for uncovered internal symbols.

5. **Given** the Test Architect's customize.toml (for `bmad-tea`),
   **When** Murat activates,
   **Then** Memtrace structural coverage analysis is acknowledged as a persistent capability
   **And** existing menu entries (TMT, TF, AT, TA, TD, TR, NR, CI, RV) are preserved unchanged.

## Tasks / Subtasks

- [x] Task 1 (AC: #1, #2, #5): Install bmad-tea and bmad-testarch-trace skills into the project
  - [x] 1.1: Copy `D:\Repos\bmad-memtrace\.agents\skills\bmad-tea\` → `D:\Repos\bmad-memtrace\bmad-memtrace\.agents\skills\bmad-tea\` (entire directory including resources/)
  - [x] 1.2: Copy `D:\Repos\bmad-memtrace\.agents\skills\bmad-testarch-trace\` → `D:\Repos\bmad-memtrace\bmad-memtrace\.agents\skills\bmad-testarch-trace\` (entire directory including steps-c/, steps-e/, steps-v/, resources/)
  - [x] 1.3: Verify both copies have complete file structure (SKILL.md, customize.toml, all step files, resources, templates)

- [x] Task 2 (AC: #5): Update bmad-tea customize.toml with Memtrace persistent fact
  - [x] 2.1: Add Memtrace structural coverage persistent fact to `bmad-tea/customize.toml`
  - [x] 2.2: Verify existing `persistent_facts` entries (project-context.md) are preserved
  - [x] 2.3: Verify existing menu entries (TMT, TF, AT, TA, TD, TR, NR, CI, RV) are unchanged
  - [x] 2.4: Verify existing role, identity, communication_style, principles are unchanged

- [x] Task 3 (AC: #1, #2, #3): Add structural symbol discovery step to `bmad-testarch-trace` Step 2 (Discover Tests)
  - [x] 3.1: Add new subsection "3.5: Discover Structural Symbols (Memtrace)" between sections 3 (Build Coverage Heuristics Inventory) and 4 (Save Progress)
  - [x] 3.2: Instruct agent to check Memtrace availability via `list_indexed_repositories`
  - [x] 3.3: If available: instruct to discover exported symbols in `{source_dir}` using `find_symbol` (kind=Function/Method/Class) and `get_directory_tree` for module structure
  - [x] 3.4: Collect symbols with their file_path, start_line, exported status, and Memtrace symbol kind
  - [x] 3.5: Record structural symbols as `structural_symbol_inventory` for Step 3/4 consumption
  - [x] 3.6: If unavailable: set `structural_symbol_inventory` to empty/null with "Structural coverage unavailable" diagnostic note
  - [x] 3.7: Preserve ALL existing sections 1-4 (Discover Tests, Categorize by Level, Build Coverage Heuristics Inventory, Save Progress)

- [x] Task 4 (AC: #1, #2, #3): Add structural-to-test cross-referencing to `bmad-testarch-trace` Step 3 (Map Criteria)
  - [x] 4.1: Add new subsection "1.5: Map Structural Symbols to Tests (Memtrace)" between sections 1 (Build Matrix) and 2 (Validate Coverage Logic)
  - [x] 4.2: For each structural symbol in `structural_symbol_inventory`, search test files for references to that symbol name
  - [x] 4.3: Mark coverage status per symbol: FULL (has tests), NONE (no tests found), PARTIAL (only unit, no E2E, etc.)
  - [x] 4.4: Cross-reference with existing requirement-based matrix — flag symbols that are covered by requirements but not by any test file
  - [x] 4.5: Build `structural_coverage_matrix` — array of { symbol, kind, file_path, line, coverage_status, matched_tests[] }
  - [x] 4.6: If `structural_symbol_inventory` is empty (Memtrace unavailable): skip structural mapping entirely
  - [x] 4.7: Preserve ALL existing sections 1-3 (Build Matrix, Validate Coverage Logic, Save Progress)

- [x] Task 5 (AC: #1, #4): Enhance `bmad-testarch-trace` Step 4 (Analyze Gaps) with structural gap analysis
  - [x] 5.1: Add new subsection between section 2 (Coverage Heuristics Checks) and section 3 (Generate Recommendations) for "2.5: Structural Coverage Gap Analysis (Memtrace)"
  - [x] 5.2: Classify structural gaps: exported symbols with no tests → HIGH severity, internal symbols with no tests → MEDIUM
  - [x] 5.3: Merge structural gaps into the existing gap classification arrays (`criticalGaps`, `highGaps`, etc.) if structurally relevant
  - [x] 5.4: Add structural coverage statistics: `structural_coverage_statistics` with total_symbols, covered_symbols, uncovered_symbols, coverage_percentage
  - [x] 5.5: Add structural recommendations: if uncovered exported symbols exist → "Add tests for {count} uncovered exported symbols: {symbol_list}"
  - [x] 5.6: Add structural gaps to the coverage heuristics counts: `structural_coverage_gaps` in `heuristicGapCounts`
  - [x] 5.7: Include structural coverage in the Phase 1 summary display
  - [x] 5.8: If `structural_symbol_inventory` is empty (Memtrace unavailable): skip structural gap analysis, add "Structural coverage analysis unavailable" to the summary
  - [x] 5.9: Preserve ALL existing code blocks, orchestration logic, mode resolution, and save progress mechanism

- [x] Task 6 (AC: #2): Update `bmad-testarch-trace` trace-template.md with structural coverage section
  - [x] 6.1: Add "Structural Coverage Analysis" section to the template (between "Coverage by Test Level" and "Traceability Recommendations")
  - [x] 6.2: Template section includes: Structural Coverage Summary table (symbols total, covered, uncovered, coverage%), Detailed Symbol-Test Mapping (per-symbol entries), Structural Gap Analysis (prioritized by exported/internal)
  - [x] 6.3: Add structural coverage variables to the template frontmatter: `structuralCoverageEnabled`, `structuralSymbolCount`, `structuralCoveredCount`
  - [x] 6.4: Add structural coverage section to the Integrated YAML Snippet
  - [x] 6.5: Preserve ALL existing template sections unchanged

- [x] Task 7 (AC: #5): Update bmad-testarch-trace customize.toml with Memtrace persistent fact
  - [x] 7.1: Add Memtrace structural coverage persistent fact to `bmad-testarch-trace/customize.toml` persistent_facts array
  - [x] 7.2: Verify existing `persistent_facts` entries (project-context.md) are preserved

- [x] Task 8: Validation
  - [x] 8.1: Verify no SKILL.md files were modified — only step files, customize.toml, and template files
  - [x] 8.2: Verify all existing step instructions, execution protocols, and sequential flow preserved
  - [x] 8.3: All Memtrace query points have graceful degradation (advisory, not blocking)
  - [x] 8.4: Anti-Promise.all enforcement is explicit in any Memtrace query instructions mentioning parallel processing
  - [x] 8.5: `npm run validate:skills` passes or has only pre-existing failures
  - [x] 8.6: All memtrace test suites pass (adapter, qa, vdc, restart)
  - [x] 8.7: Verify both installed skills (bmad-tea, bmad-testarch-trace) have complete file structures matching the outer originals

## Dev Notes

### What This Story Does

This story installs the Test Architect Agent (`bmad-tea`, Murat) and its `bmad-testarch-trace` workflow into the project, then integrates Memtrace structural graph queries to add a **structural symbol-to-test coverage dimension** to the existing requirements-based traceability workflow.

**Before this story:** The Test Architect's coverage traceability workflow maps only _requirements_ (acceptance criteria, user journeys, API endpoints) to tests. It has zero awareness of the actual codebase structure. The `bmad-tea` persona and `bmad-testarch-trace` workflow do not exist in the project.

**After this story:** The Test Architect has Memtrace-powered structural intelligence:

- The trace workflow queries the Memtrace graph to discover all exported functional symbols in a target module
- It cross-references those symbols against the discovered test files to identify which symbols have coverage and which don't
- Uncovered exported symbols are flagged as HIGH severity gaps — these are functional code with zero test coverage
- The traceability matrix template includes a "Structural Coverage Analysis" section showing symbol-to-test mapping
- The gap analysis incorporates structural gaps alongside the existing endpoint/auth/error-path heuristic gaps

This implements **FR14** (Test Architect Agent can cross-reference test files against graph symbols to identify test coverage gaps) from Epic 6 (Multi-Agent Structural Intelligence).

### Critical Architecture Constraints

- **SKILL INSTALLATION REQUIRED:** This story requires copying two skills from the outer `.agents/skills/` directory into the inner project directory. The skills are `bmad-tea` (dispatcher persona) and `bmad-testarch-trace` (coverage traceability workflow). Do NOT modify the outer originals — only the inner project copies.
- **GRACEFUL DEGRADATION IS MANDATORY:** Memtrace structural coverage is an ADVISORY dimension. If Memtrace is unavailable (not indexed, server down, timeout), the workflow MUST continue with requirements-based coverage analysis only. Never block the trace workflow on Memtrace availability.
- **NO NEW SCRIPTS OR CODE:** This story is a pure skill-installation + skill-file modification. Do NOT create scripts, modify the adapter, change `package.json`, or touch `_bmad/scripts/memtrace/`.
- **File location rule (CRITICAL):** All repository files go to `D:\Repos\bmad-memtrace\bmad-memtrace\`. The installed skill files go to `.agents\skills\bmad-tea\` and `.agents\skills\bmad-testarch-trace\` inside the inner project.
- **UPDATE only (except install):** After copying the skills, all modifications are to existing step files in `bmad-testarch-trace/steps-c/` and config/template files. No CREATE operations for new files.
- **Micro-file architecture preservation:** Each step file follows micro-file design with explicit execution rules and mandatory sequence. All injected content must respect these existing patterns.
- **Anti-Promise.all pattern:** Any Memtrace query instructions must use sequential `for...of` with `await`. This applies to instruction text (what agents following the step will do).
- **Index freshness:** Any graph query instruction must include a freshness check step before trusting the output.
- **Token budget (NFR1):** Memtrace structural responses injected into agent context must use summarized output to stay under 2000 tokens.
- **Two-layer coverage:** The structural symbol coverage is a NEW dimension — it augments (not replaces) the existing requirements-based coverage. Both dimensions coexist in the traceability matrix.

### Architecture Compliance

- **No-Vanilla Opt-out (Architecture Decision #1):** The integration reinforces the commitment to Memtrace as the primary source of structural truth. The Test Architect now leverages the graph for coverage analysis.
- **Stateless design:** No state is persisted — structural symbol queries are read-only against the Memtrace graph. The skills remain behavioral guides.
- **Process confinement (NFR4):** No process management needed — no server restart commands are invoked.
- **Quality Gate principle:** The structural coverage gaps feed into the trace workflow's existing gap analysis and recommendations. They do NOT alter the gate decision criteria (P0/P1 thresholds) — structural gaps are advisory input to the gap analysis, not new gate criteria.
- **Cross-Cutting Concern — Index Freshness:** Each Memtrace query point must include a freshness pre-check, consistent with all previous Epic integrations.

### Skill Architecture

**bmad-tea (Murat, the dispatcher):**

- **Role:** Persona/dispatch layer. Murat doesn't execute test workflows directly — he dispatches to `bmad-testarch-trace`, `bmad-testarch-framework`, `bmad-testarch-atdd`, etc.
- **Current state:** Exists in outer `.agents/skills/`, NOT in inner project. Has no Memtrace awareness.
- **Change:** Copy to inner project. Add one persistent fact acknowledging Memtrace structural coverage capability.

**bmad-testarch-trace (Coverage Traceability):**

- **Role:** Primary coverage gap analysis workflow. Murat dispatches here when user wants coverage traceability.
- **Architecture:** Tri-modal (Create/Validate/Edit) with 5 create-mode steps:
  - Step 1: Resolve coverage oracle (requirements → spec → synthetic)
  - Step 2: Discover and catalog tests by level
  - Step 3: Map coverage oracle items to tests (build traceability matrix)
  - Step 4: Analyze gaps, generate recommendations, output Phase 1 coverage matrix
  - Step 5: Apply gate decision logic, generate final report
- **Current state:** Exists in outer `.agents/skills/`, NOT in inner project. No structural symbol awareness.
- **Changes:**
  - Step 2: Add structural symbol discovery (subsection 3.5)
  - Step 3: Add symbol-to-test mapping (subsection 1.5)
  - Step 4: Add structural gap analysis (subsection 2.5), merge into existing gap arrays
  - trace-template.md: Add Structural Coverage Analysis section
  - customize.toml: Add Memtrace persistent fact

### Injection Point Rationale

1. **Why inject symbol discovery in Step 2 (not Step 1)?**
   Step 1 resolves the coverage _oracle_ (requirements, specs, synthetic journeys). Step 2 discovers _tests_. The structural symbol discovery is a parallel test-discovery path — finding what's in the codebase TO test. Keeping it in Step 2 maintains the "gather inputs" phase cohesion.

2. **Why inject symbol-to-test mapping in Step 3 (not Step 4)?**
   Step 3 builds the traceability matrix. Structural symbol-to-test mapping is a coverage dimension just like requirement-to-test mapping. It belongs in the mapping step, feeding into Step 4's gap analysis. Putting it in Step 4 would bypass the matrix-building phase.

3. **Why add structural gaps to the existing gap arrays?**
   The gap analysis in Step 4 already has priority-based classification (critical/high/medium/low). Structural gaps map naturally: uncovered exported symbols → HIGH (they're functional code with no tests), uncovered internal symbols → MEDIUM. This avoids creating a parallel gap tracking system.

4. **Why only bmad-testarch-trace (not all testarch skills)?**
   FR14 is specifically about coverage gap analysis: "cross-reference test files against graph symbols to identify test coverage gaps." The `bmad-testarch-trace` workflow is THE coverage traceability workflow. Other testarch skills (`bmad-testarch-test-design`, `bmad-testarch-automate`, etc.) may benefit from structural context but are NOT part of this story's scope. They can be enhanced in follow-up stories.

5. **Why install via copy (not BMB module)?**
   The skills already exist in the outer `.agents/skills/` and are fully functional. Direct copy is the simplest approach. The BMB module builder is for creating NEW skills or pulling from remote sources — unnecessary overhead when the skill files are already local.

### Files Being Modified

All files are in `D:\Repos\bmad-memtrace\bmad-memtrace\.agents\skills\`.

#### Task 1: Install bmad-tea skill (NEW — copy from outer)

**Source:** `D:\Repos\bmad-memtrace\.agents\skills\bmad-tea\`
**Target:** `D:\Repos\bmad-memtrace\bmad-memtrace\.agents\skills\bmad-tea\`
**Files to copy:**

- `SKILL.md` (80 lines — persona definition, activation, dispatch)
- `customize.toml` (104 lines — agent config, menu, persistent_facts)
- `resources/tea-index.csv` (knowledge fragment index)
- `resources/knowledge/` (knowledge fragments directory — all files)

#### Task 1: Install bmad-testarch-trace skill (NEW — copy from outer)

**Source:** `D:\Repos\bmad-memtrace\.agents\skills\bmad-testarch-trace\`
**Target:** `D:\Repos\bmad-memtrace\bmad-memtrace\.agents\skills\bmad-testarch-trace\`
**Files to copy:**

- `SKILL.md` (87 lines — workflow definition, activation, mode dispatch)
- `customize.toml` (40 lines — workflow config)
- `workflow.yaml` (80 lines — workflow configuration)
- `instructions.md` (workflow instructions)
- `checklist.md` (validation checklist)
- `trace-template.md` (716 lines — comprehensive template)
- `steps-c/step-01-load-context.md` (166 lines)
- `steps-c/step-01b-resume.md`
- `steps-c/step-02-discover-tests.md` (132 lines)
- `steps-c/step-03-map-criteria.md` (101 lines)
- `steps-c/step-04-analyze-gaps.md` (628 lines)
- `steps-c/step-05-gate-decision.md` (681 lines)
- `steps-e/` (all edit-mode step files)
- `steps-v/` (all validate-mode step files)
- `resources/` (knowledge fragments)
- `workflow-plan.md`

---

#### Task 2: `bmad-tea/customize.toml` (UPDATE)

**Current state (104 lines):**

- Agent definition (Murat, Master Test Architect)
- Menu: TMT → bmad-teach-me-testing, TF → bmad-testarch-framework, etc. (9 menu items)
- `persistent_facts = ["file:{project-root}/**/project-context.md"]`
- Role, identity, communication_style, principles

**What this story changes:**
Add one entry to `persistent_facts`:

```toml
persistent_facts = [
  "file:{project-root}/**/project-context.md",
  "Memtrace structural coverage analysis is available for test coverage gap identification. The Test Architect traceability workflow (bmad-testarch-trace) can query the Memtrace graph to discover exported functional symbols in target modules and cross-reference them against test files to identify uncovered code. Use Memtrace MCP tools (find_symbol with kind=Function/Method/Class, get_source_window for symbol source, get_directory_tree for module structure, list_indexed_repositories for freshness check). Structural coverage is advisory — NEVER block the trace workflow on Memtrace availability. All graph queries MUST use sequential for...of with await — NEVER Promise.all. Prefer summarized output to stay under 2000 token limit.",
]
```

**What must be preserved:**

- All existing fields: name, title, icon, role, identity, communication_style, principles
- ALL menu entries (TMT, TF, AT, TA, TD, TR, NR, CI, RV) — these dispatch to other testarch skills
- activation_steps_prepend and activation_steps_append (both empty)
- The existing `file:{project-root}/**/project-context.md` persistent fact entry

---

#### Task 3: `bmad-testarch-trace/steps-c/step-02-discover-tests.md` (UPDATE)

**Current state (132 lines):**

- Mandatory execution rules, execution protocols
- Section 1: Discover Tests (search for test IDs, feature matches, patterns)
- Section 2: Categorize by Level (E2E/API/Component/Unit)
- Section 3: Build Coverage Heuristics Inventory (endpoint, auth, error-path, UI)
- Section 4: Save Progress
- No Memtrace or structural symbol awareness whatsoever

**What this story changes:**
Insert a new subsection "3.5: Discover Structural Symbols (Memtrace)" between sections 3 (Build Coverage Heuristics Inventory) and 4 (Save Progress):

````
### 3.5: Discover Structural Symbols (Memtrace)

If the project repository is indexed by Memtrace, query the graph to discover exported
functional symbols in the target module. This step is ADVISORY — skip if Memtrace is unavailable.

**Check Availability:**
- Use the Memtrace MCP tool `list_indexed_repositories` to confirm the project repo is indexed
- If no indexed repo matches the project root, set `structural_symbol_inventory` to empty/null
  and skip to section 4 (Save Progress) with a diagnostic note: "Structural coverage unavailable —
  no indexed repository found"

**If Available — Discover Exported Symbols:**

1. **Identify target module scope:**
   - Use `{source_dir}` from workflow config as the base search directory
   - If a specific module or file was targeted (from user input or oracle), limit to that scope
   - Use `get_directory_tree` (mode=compact, max_depth=3) to understand the module structure

2. **Query for structural symbols:**
   - Call `find_symbol` with kind="Function" to discover exported functions in the target scope
   - Call `find_symbol` with kind="Method" to discover exported methods
   - Call `find_symbol` with kind="Class" to discover exported classes (if applicable)
   - Process STRICTLY SEQUENTIALLY using `for...of` with `await` — NEVER `Promise.all`
   - For each symbol result, record:
     - `name`: symbol name
     - `kind`: Function | Method | Class
     - `file_path`: source file path
     - `start_line`: line number in source
     - `exported`: whether the symbol is exported (public API surface)
     - `complexity_score`: Memtrace complexity rating (if available)
     - `risk_level`: Memtrace risk level (if available)

3. **Filter and prioritize:**
   - Focus on **exported** symbols first — these are the public API surface that must be tested
   - Include non-exported symbols with high complexity or high risk as secondary coverage targets
   - De-duplicate symbols (same name + same file = same symbol)
   - Cap at 100 symbols per query to avoid context bloat

**Record Structural Inventory:**

Build `structural_symbol_inventory` as a JSON structure:

```javascript
const structural_symbol_inventory = {
  status: "available", // "available" | "partial" | "unavailable"
  source_scope: "{source_dir or targeted module path}",
  total_symbols: /* count */,
  exported_count: /* count */,
  symbols: [
    {
      name: "functionName",
      kind: "Function",
      file_path: "src/module/file.ts",
      start_line: 42,
      exported: true,
      complexity_score: /* number or null */,
      risk_level: "medium"
    },
    // ... more symbols
  ],
  diagnostic: null // set to "Partial — some queries failed" if partial
};
````

**Graceful Degradation:**

- If `list_indexed_repositories` returns empty or the project repo is NOT indexed:
  set `structural_symbol_inventory = { status: "unavailable", symbols: [], diagnostic: "Memtrace not indexed" }`
- If an individual `find_symbol` query times out or fails:
  note the failure, continue with remaining queries, set status to "partial"
- NEVER block the step on Memtrace availability — structural discovery is supplemental

**If Unavailable:**

- Set `structural_symbol_inventory = { status: "unavailable", symbols: [], diagnostic: "Memtrace not available" }`
- Continue to section 4 (Save Progress)
- The remaining steps will skip structural analysis gracefully

```

**What must be preserved:**
- All mandatory execution rules (unchanged)
- Sections 1-3 (Discover Tests, Categorize by Level, Build Coverage Heuristics Inventory) — unchanged
- Section 4 (Save Progress) — unchanged except for including `structural_symbol_inventory` in saved data
- All success/failure metrics — unchanged

---

#### Task 4: `bmad-testarch-trace/steps-c/step-03-map-criteria.md` (UPDATE)

**Current state (101 lines):**
- Section 1: Build Matrix (map oracle items to tests)
- Section 2: Validate Coverage Logic
- Section 3: Save Progress
- No structural symbol mapping whatsoever

**What this story changes:**
Insert a new subsection "1.5: Map Structural Symbols to Tests (Memtrace)" between sections 1 (Build Matrix) and 2 (Validate Coverage Logic):

```

### 1.5: Map Structural Symbols to Tests (Memtrace)

If `structural_symbol_inventory` is available (status = "available" or "partial"),
cross-reference each discovered symbol against the test inventory from Step 2 to build a
structural coverage dimension. This runs alongside the requirements-based matrix from section 1.

**Skip this entire subsection if:** `structural_symbol_inventory.status` is `"unavailable"` or `structural_symbol_inventory.symbols` is empty.

**Cross-Reference Process:**

For each symbol in `structural_symbol_inventory.symbols`:

1. **Search test files for symbol references:**
   - Search discovered test files (from Step 2) for the symbol's `name` as text
   - Look for imports of the symbol's file, function calls, class instantiations, or type references
   - Use the naming conventions from `test-priorities-matrix.md` (loaded in Step 1) to identify related test patterns
   - Process STRICTLY SEQUENTIALLY — do NOT parallelize test file searches

2. **Determine coverage status per symbol:**

   | Condition                                                  | Coverage Status    |
   | ---------------------------------------------------------- | ------------------ |
   | Symbol found in test file(s) with assertions/exercises     | `FULL`             |
   | Symbol referenced in test file(s) but only imported/mocked | `PARTIAL`          |
   | Symbol not found in any test file                          | `NONE`             |
   | Symbol only in unit test, missing E2E/integration          | `UNIT-ONLY`        |
   | Symbol only in E2E test, missing unit test                 | `INTEGRATION-ONLY` |

3. **Assign priority based on symbol characteristics:**

   ```javascript
   const structuralPriority = (symbol) => {
     if (symbol.exported && symbol.complexity_score >= 10) return 'P0';
     if (symbol.exported) return 'P1';
     if (symbol.complexity_score >= 10) return 'P2';
     return 'P3';
   };
   ```

**Build `structural_coverage_matrix`:**

```javascript
const structural_coverage_matrix = structural_symbol_inventory.symbols.map(symbol => ({
  id: `SYM-${symbol.file_path}:${symbol.name}`,
  type: 'structural_symbol',
  description: `${symbol.kind} \`${symbol.name}\` in ${symbol.file_path}:${symbol.start_line}`,
  priority: structuralPriority(symbol),
  coverage: /* determined coverage status */,
  tests: [
    {
      id: /* test ID */,
      file: /* test file path */,
      title: /* test description */,
      level: /* E2E | API | Component | Unit */
    }
  ],
  exported: symbol.exported,
  complexity_score: symbol.complexity_score,
  risk_level: symbol.risk_level
}));
```

**Integration with requirements matrix:**

- The `structural_coverage_matrix` is a SEPARATE array from the requirements-based `traceabilityMatrix`
- Both feed into Step 4 independently
- Do NOT merge structural symbols into the requirements-based matrix — they are different dimensions

**Graceful Degradation:**

- If `structural_symbol_inventory.status` is `"partial"`: apply cross-reference only to symbols that were successfully discovered, note which were missed
- If test file search for a symbol fails: mark that symbol's coverage as `"unknown"` with a diagnostic note
- NEVER block or halt on structural mapping failures

```

**What must be preserved:**
- All mandatory execution rules (unchanged)
- Section 1 (Build Matrix) — unchanged, structural mapping runs alongside it
- Section 2 (Validate Coverage Logic) — unchanged
- Section 3 (Save Progress) — unchanged except for including `structural_coverage_matrix` in saved data

---

#### Task 5: `bmad-testarch-trace/steps-c/step-04-analyze-gaps.md` (UPDATE)

**Current state (628 lines):**
- Orchestration mode resolution (auto/subagent/agent-team/sequential)
- Section 1: Gap Analysis (uncovered, partial, unit-only)
- Section 2: Coverage Heuristics Checks (endpoint, auth, error-path, UI)
- Section 3: Generate Recommendations
- Section 4: Calculate Coverage Statistics
- Section 4b: Build Deduplicated Test Inventory
- Section 5: Generate Complete Coverage Matrix
- Section 6: Output to Temp File
- Section 7: Display Phase 1 Summary
- Orchestration notes
- Section 8: Save Progress

**What this story changes:**

**A) Insert new subsection "2.5: Structural Coverage Gap Analysis (Memtrace)"** between section 2 (Coverage Heuristics Checks) and section 3 (Generate Recommendations):

```

### 2.5: Structural Coverage Gap Analysis (Memtrace)

If `structural_coverage_matrix` is available (not empty/null), analyze structural coverage
gaps — symbols in the codebase that lack corresponding test coverage.

**Skip this entire subsection if:** `structural_coverage_matrix` is empty, null, or
`structural_symbol_inventory.status` is `"unavailable"`.

**Classify structural gaps:**

```javascript
const structuralUncovered = structural_coverage_matrix.filter((s) => s.coverage === 'NONE');
const structuralPartial = structural_coverage_matrix.filter((s) => s.coverage === 'PARTIAL');
const structuralUnitOnly = structural_coverage_matrix.filter((s) => s.coverage === 'UNIT-ONLY');

// Exported symbols with NO coverage are HIGH severity gaps
const structuralHighGaps = structuralUncovered.filter((s) => s.exported);
// Non-exported symbols with NO coverage are MEDIUM severity gaps
const structuralMediumGaps = structuralUncovered.filter((s) => !s.exported);
// Partial coverage is MEDIUM severity
const structuralPartialGaps = structuralPartial;

// Export status takes priority over complexity for gap severity
const structuralCriticalGaps = structuralUncovered.filter(
  (s) => s.exported && s.risk_level === 'critical'
);
```

**Merge structural gaps into existing gap arrays:**

```javascript
// Structural critical gaps (exported + critical risk) → merged into criticalGaps
// Structural high gaps (exported symbols, no tests) → merged into highGaps
// Structural medium gaps (internal symbols, no tests) → merged into mediumGaps
// Do NOT mutate the original arrays — create new merged arrays

const allHighGaps = [
  ...highGaps,
  ...structuralHighGaps.map((s) => ({
    id: s.id,
    priority: 'P1',
    description: s.description,
    coverage: 'NONE',
    reason: 'Exported structural symbol has zero test coverage',
  })),
];

const allMediumGaps = [
  ...mediumGaps,
  ...structuralMediumGaps.map((s) => ({
    id: s.id,
    priority: 'P2',
    description: s.description,
    coverage: 'NONE',
    reason: 'Internal structural symbol has zero test coverage',
  })),
];
```

**Calculate structural coverage statistics:**

```javascript
const structuralTotal = structural_coverage_matrix.length;
const structuralCovered = structural_coverage_matrix.filter((s) => s.coverage === 'FULL').length;
const structuralCoveragePct = safePct(structuralCovered, structuralTotal);

const structuralCoverageStatistics = {
  total_symbols: structuralTotal,
  covered_symbols: structuralCovered,
  uncovered_symbols: structuralUncovered.length,
  partially_covered: structuralPartial.length,
  coverage_percentage: structuralCoveragePct,
  exported: {
    total: structural_coverage_matrix.filter((s) => s.exported).length,
    covered: structural_coverage_matrix.filter((s) => s.exported && s.coverage === 'FULL').length,
    uncovered: structuralHighGaps.length,
  },
  priority_breakdown: {
    P0: structural_coverage_matrix.filter((s) => s.priority === 'P0').length,
    P1: structural_coverage_matrix.filter((s) => s.priority === 'P1').length,
    P2: structural_coverage_matrix.filter((s) => s.priority === 'P2').length,
    P3: structural_coverage_matrix.filter((s) => s.priority === 'P3').length,
  },
};
```

**Graceful Degradation:**

- If `structural_coverage_matrix` is empty/null: skip this entire subsection, set `structuralCoverageStatistics` to null
- If `structural_symbol_inventory.status` is `"partial"`: apply gap analysis only to successfully discovered symbols, note the partial status in diagnostics

````

**B) Add structural recommendations to section 3 (Generate Recommendations):**

Insert AFTER the existing recommendation block but BEFORE the quality issues recommendation:

```javascript
// Structural coverage recommendations
if (structural_coverage_matrix && structural_coverage_matrix.length > 0) {
  if (structuralHighGaps.length > 0) {
    recommendations.push({
      priority: 'HIGH',
      action: `Add tests for ${structuralHighGaps.length} uncovered exported structural symbols`,
      requirements: structuralHighGaps.map(s => s.id),
    });
  }
  if (structuralMediumGaps.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      action: `Add tests for ${structuralMediumGaps.length} uncovered internal structural symbols`,
      requirements: structuralMediumGaps.map(s => s.id),
    });
  }
  if (structuralPartialGaps.length > 0) {
    recommendations.push({
      priority: 'MEDIUM',
      action: `Enhance test coverage for ${structuralPartialGaps.length} partially covered symbols`,
      requirements: structuralPartialGaps.map(s => s.id),
    });
  }
}
````

**C) Add structural coverage to section 5 (Complete Coverage Matrix):**

Add to the `coverageMatrix` object:

```javascript
// Inside the coverageMatrix object, alongside existing fields:
structural_coverage: structural_coverage_matrix && structural_coverage_matrix.length > 0 ? {
  status: structural_symbol_inventory.status,
  statistics: structuralCoverageStatistics,
  symbols: structural_coverage_matrix,
  high_gaps: structuralHighGaps,
  medium_gaps: structuralMediumGaps,
} : null,
```

**D) Add structural coverage to section 6 (Display Phase 1 Summary):**

Add to the summary display:

```
🔬 Structural Coverage (Memtrace):
- Total Symbols Discovered: {structuralTotal}
- Covered: {structuralCovered} ({structuralCoveragePct}%)
- Uncovered Exported: {structuralHighGaps.length}
- Uncovered Internal: {structuralMediumGaps.length}
  {If unavailable:}
  Structural coverage analysis unavailable — Memtrace not indexed or queries failed.
```

**What must be preserved:**

- ALL existing sections 0-8 with their code blocks, logic, and sequence — unchanged
- Orchestration mode resolution (unchanged)
- Existing gap analysis logic (section 1) — structural gaps MERGE INTO existing arrays, don't replace them
- Existing coverage heuristics (section 2) — structural is a NEW subsection 2.5, not a replacement
- Recommendations generation (section 3) — structural recommendations are APPENDED to existing recommendations array
- Statistics calculation (section 4) — structural statistics are ADDED alongside existing
- Deduplicated test inventory (section 4b) — unchanged
- Coverage matrix and temp file output (sections 5-6) — structural data is ADDED to the matrix
- Summary display (section 7) — structural coverage line is APPENDED to existing display
- Save progress (section 8) — unchanged

---

#### Task 6: `bmad-testarch-trace/trace-template.md` (UPDATE)

**Current state (716 lines):**
Comprehensive template for the traceability matrix report. Covers requirements traceability (Phase 1) and gate decision (Phase 2). No structural coverage concept.

**What this story changes:**
Insert a new section AFTER "Coverage by Test Level" and BEFORE "Traceability Recommendations":

```
---

### Structural Coverage Analysis {✅ / ⚠️ / —}

{If Memtrace was available:}

#### Structural Coverage Summary

| Category          | Total  | Covered | Uncovered | Coverage % | Status       |
| ----------------- | ------ | ------- | --------- | ---------- | ------------ |
| Exported Symbols  | {EXP_TOTAL} | {EXP_COVERED} | {EXP_UNCOVERED} | {EXP_PCT}%  | {EXP_STATUS}  |
| Internal Symbols  | {INT_TOTAL} | {INT_COVERED} | {INT_UNCOVERED} | {INT_PCT}%  | {INT_STATUS}  |
| **All Symbols**   | **{SYM_TOTAL}** | **{SYM_COVERED}** | **{SYM_UNCOVERED}** | **{SYM_PCT}%** | **{SYM_STATUS}** |

**Legend:**
- ✅ PASS — All exported symbols have test coverage
- ⚠️ WARN — Some exported symbols lack coverage
- ❌ FAIL — Critical exported symbols have no test coverage

---

#### Detailed Symbol-Test Mapping

##### {SYM_ID}: {SYMBOL_KIND} `{SYMBOL_NAME}` — {SYMBOL_FILE}:{LINE} ({PRIORITY})

- **Coverage:** {COVERAGE_STATUS} {STATUS_ICON}
- **Exported:** {YES / NO}
- **Complexity:** {COMPLEXITY_SCORE} ({RISK_LEVEL})
- **Tests:**
  - `{TEST_ID}` - {TEST_FILE}:{LINE}
    - **Type:** {E2E / API / Component / Unit}
    - **Description:** {TEST_DESCRIPTION}

- **Gaps:** (if NONE or PARTIAL)
  - {GAP_DESCRIPTION}

- **Recommendation:** {SYMBOL_LEVEL_RECOMMENDATION}

---

#### Structural Gap Analysis

##### Critical Structural Gaps (BLOCKER) ❌

{CRITICAL_STRUCTURAL_COUNT} exported symbols with critical risk AND zero test coverage found.

1. **{SYMBOL_NAME}** — {SYMBOL_FILE}:{LINE} (P0)
   - Kind: {SYMBOL_KIND}
   - Risk: {RISK_LEVEL}
   - Complexity: {COMPLEXITY_SCORE}
   - Impact: {IMPACT_DESCRIPTION}

---

##### High Priority Structural Gaps (PR BLOCKER) ⚠️

{HIGH_STRUCTURAL_COUNT} exported symbols with zero test coverage found.

1. **{SYMBOL_NAME}** — {SYMBOL_FILE}:{LINE} (P1)
   - Kind: {SYMBOL_KIND}
   - Recommend: Add {E2E / API / Component / Unit} test covering this symbol

---

##### Medium Priority Structural Gaps (Nightly) ⚠️

{MEDIUM_STRUCTURAL_COUNT} internal symbols with zero test coverage found.

1. **{SYMBOL_NAME}** — {SYMBOL_FILE}:{LINE} (P2)
   - Kind: {SYMBOL_KIND}
   - Recommend: Consider adding unit test for this non-exported symbol

---

{If Memtrace was unavailable:}
— Structural coverage analysis unavailable — Memtrace not indexed or structural queries failed.
```

**Also update the Integrated YAML Snippet** to include structural coverage:

```yaml
structural_coverage: # Only when Memtrace was available
  status: '{available | partial | unavailable}'
  statistics:
    total_symbols: { SYM_TOTAL }
    covered_symbols: { SYM_COVERED }
    coverage_percentage: { SYM_PCT }
    exported_uncovered: { EXP_UNCOVERED }
  gaps:
    critical: { CRITICAL_STRUCTURAL_COUNT }
    high: { HIGH_STRUCTURAL_COUNT }
    medium: { MEDIUM_STRUCTURAL_COUNT }
```

**What must be preserved:**

- ALL existing template sections from PHASE 1 to PHASE 2 to Sign-Off — unchanged
- The structural coverage section is INSERTED as a new section within Phase 1, not as a replacement
- Template frontmatter additions are appends only

---

#### Task 7: `bmad-testarch-trace/customize.toml` (UPDATE)

**Current state (40 lines):**

- `persistent_facts = ["file:{project-root}/**/project-context.md"]`
- Empty activation steps

**What this story changes:**
Add one entry to `persistent_facts`:

```toml
persistent_facts = [
  "file:{project-root}/**/project-context.md",
  "Memtrace structural coverage analysis capabilities are available during coverage traceability. Query the Memtrace graph to discover exported functional symbols in target modules (using find_symbol with kind=Function/Method/Class), build a structural-to-test coverage matrix, and identify uncovered code for gap analysis. Use list_indexed_repositories to check index freshness before querying. All graph queries MUST use sequential for...of with await — NEVER Promise.all. Structural coverage is advisory and augments (not replaces) requirements-based coverage analysis. Skip gracefully if Memtrace is unavailable — never block the trace workflow on structural analysis.",
]
```

**What must be preserved:**

- All existing fields: activation_steps_prepend, activation_steps_append (both empty)
- on_complete (empty)
- The existing `file:{project-root}/**/project-context.md` persistent fact entry

### Design Decisions for the Dev Agent

1. **Why install bmad-tea via copy from outer directory?**
   The `bmad-tea` skill already exists in the outer `.agents/skills/` with complete persona definition, menu, and resource files. Copying preserves all of this. Installing via BMB module builder would re-derive the skill from source templates, which might not match the installed version. The outer copy IS the canonical installed version.

2. **Why only bmad-testarch-trace (not all testarch skills)?**
   FR14 targets "cross-reference test files against graph symbols to identify test coverage gaps." The `bmad-testarch-trace` workflow IS the coverage gap analysis workflow. Other testarch skills (`bmad-testarch-test-design`, `bmad-testarch-automate`, `bmad-testarch-atdd`) may benefit from structural context in future stories, but this story's scope is specifically coverage gap analysis.

3. **Why install bmad-testarch-trace but not other testarch skills?**
   Murat's menu dispatches to 9 testarch skills. However, only `bmad-testarch-trace` is being enhanced with Memtrace in this story. Installing other testarch skills now (without Memtrace integration) would create orphan menu entries that don't work (the skills aren't in the inner project). The dev agent should ONLY install `bmad-tea` and `bmad-testarch-trace` — Murat's menu will show all 9 entries, but only `TR` (trace) will work. This is acceptable: the menu serves as a roadmap of available capabilities. Other skills can be installed in follow-up stories.

4. **Why structural coverage as a separate dimension (not merged into requirements matrix)?**
   Requirements-to-test coverage answers "are the requirements tested?" Structural-to-test coverage answers "is the code tested?" These are fundamentally different concerns. Merging them would conflate two different coverage dimensions and make gap analysis ambiguous. Keeping them separate allows the Test Architect to surface both "you have untested requirements" and "you have untested code" as distinct findings.

5. **Why HIGH severity for uncovered exported symbols?**
   Exported symbols are the public API surface of a module. If they have zero test coverage, any change to them carries unknown risk. This is particularly dangerous in brownfield projects where exported symbols may have many dependents. The severity matches the existing heuristic model where uncovered critical requirements = BLOCKER.

6. **Why `find_symbol` instead of `find_code` for symbol discovery?**
   `find_symbol` returns exact symbol matches with kind, file_path, complexity_score, and risk_level precomputed. This is exactly the data needed for structural coverage mapping. `find_code` is better for natural language search but returns text matches without structural metadata.

7. **Why test file search via text matching (not graph) for cross-referencing?**
   The Memtrace graph maps relationships between source code symbols. Test files typically don't have call-graph edges to the symbols they test (tests don't "call" the function in the same way production code does). Text search for symbol names in test files is the pragmatic approach. Future Memtrace versions may add explicit test-coverage edges, which would enable purely graph-based cross-referencing.

### Previous Story Intelligence

#### From Story 6.2 (Code Reviewer Deep Audit)

- **Skill installation + modification pattern:** 6.2 modified both source templates AND installed skill copies. This story also does installation (copy) + modification.
- **Graceful degradation established:** All Memtrace query points are advisory, not blocking. The `"unavailable"` → skip pattern is mandatory.
- **Micro-file injection pattern:** 6.2 inserted new subsections between existing numbered sections. This story follows the identical pattern (new step 3.5 in step-02, new 1.5 in step-03, new 2.5 in step-04).
- **"Partial" state handling:** 6.2 review established the `"partial"` state for when some but not all queries succeed. This story uses `"partial"` for structural symbol discovery.
- **Persistent fact pattern:** 6.2 added Memtrace capability facts to customize.toml for both code-review skills. This story adds persistent facts to both bmad-tea and bmad-testarch-trace.
- **Review patches applied:**
  - Explicit freshness check via `list_indexed_repositories`
  - Anti-Promise.all language in query instructions
  - Token budget guidance (summarized output)
  - No SKILL.md modification
  - All existing content preserved unchanged

#### From Story 6.1 (Architect & Readiness Validator Structural Context)

- **Persona + dispatch layer pattern:** 6.1 modified `bmad-agent-architect` (Winston, persona/dispatch) with a persistent fact only — the actual integration went into dispatched workflows (`bmad-create-architecture`, `bmad-check-implementation-readiness`). This story mirrors: `bmad-tea` (Murat, persona/dispatch) gets a persistent fact, and `bmad-testarch-trace` gets the actual integration.
- **Skill-only modification pattern:** All Epic 6 stories modify only skill files — no scripts, no package.json changes. This story follows the identical pattern.
- **Review patches applied:**
  - Freshness check explicit timestamp check (30-minute recency)
  - Template placeholder fill-in guidance (mapping tool output fields to template variables)
  - Greenfield guard clause (skip structural analysis if no graph data exists)
  - No files outside target skill directories modified
  - Advisory nature of structural context explicitly stated

#### From Stories 3.1-3.4 (Adapters and Integration Pipeline)

- **Direct MCP tool usage:** This story uses MCP tools directly (`find_symbol`, `list_indexed_repositories`, `get_directory_tree`) rather than the adapter. These return compact output suitable for direct agent consumption. The adapter (`memtrace-adapter.mjs`) is for heavy blast-radius queries that need summarization and timeout handling.
- **Anti-Promise.all enforcement:** Sequential `for...of` with `await` — never `Promise.all`
- **Index freshness check:** Always call `list_indexed_repositories` before trusting graph output

### Git Intelligence

Recent commits show consistent patterns:

- `feat(story-6.2): implement code reviewer deep audit with independent get_impact and find_dead_code queries`
- `feat(story-6.1): implement architect and readiness validator structural context`
- `chore: alphabetize npm scripts and fix test file formatting`
- All work targets the `D:\Repos\bmad-memtrace\bmad-memtrace` repository
- Testing: `npm run quality`, `npm run validate:skills`, `node --test`
- Commit format: `feat(story-X.Y): implement <description>`

### Output Contract

**Files installed (2 directories, all files):**

| #   | File/Directory                            | Source                                                       | Destination                           | Action     |
| --- | ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------- | ---------- |
| 1   | `bmad-tea/` (entire directory)            | `D:\Repos\bmad-memtrace\.agents\skills\bmad-tea\`            | `.agents\skills\bmad-tea\`            | NEW (copy) |
| 2   | `bmad-testarch-trace/` (entire directory) | `D:\Repos\bmad-memtrace\.agents\skills\bmad-testarch-trace\` | `.agents\skills\bmad-testarch-trace\` | NEW (copy) |

**Files modified (5 files):**

| #   | File                                                                   | Action | Description                                                                               |
| --- | ---------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| 3   | `.agents/skills/bmad-tea/customize.toml`                               | UPDATE | Add Memtrace structural coverage persistent fact                                          |
| 4   | `.agents/skills/bmad-testarch-trace/customize.toml`                    | UPDATE | Add Memtrace structural coverage persistent fact                                          |
| 5   | `.agents/skills/bmad-testarch-trace/steps-c/step-02-discover-tests.md` | UPDATE | Add subsection 3.5: Discover Structural Symbols (Memtrace)                                |
| 6   | `.agents/skills/bmad-testarch-trace/steps-c/step-03-map-criteria.md`   | UPDATE | Add subsection 1.5: Map Structural Symbols to Tests (Memtrace)                            |
| 7   | `.agents/skills/bmad-testarch-trace/steps-c/step-04-analyze-gaps.md`   | UPDATE | Add subsection 2.5: Structural Coverage Gap Analysis + structural recs + structural stats |
| 8   | `.agents/skills/bmad-testarch-trace/trace-template.md`                 | UPDATE | Add Structural Coverage Analysis section + YAML snippet update                            |

**No new files created.**
**No scripts modified** — `memtrace-adapter.mjs`, `qa-memtrace.mjs`, `validate-dead-code.mjs`, `package.json`, and all other files remain untouched.
**No files outside `.agents/skills/bmad-tea/` and `.agents/skills/bmad-testarch-trace/` modified.**
**No SKILL.md files modified in any skill directory.**
**Outer originals** (`D:\Repos\bmad-memtrace\.agents\skills\bmad-tea\`, `D:\Repos\bmad-memtrace\.agents\skills\bmad-testarch-trace\`) remain UNCHANGED.

### Testing Requirements

#### Automated Tests — NONE required

This story modifies only markdown instruction files, toml config files, and markdown templates — no executable code. All existing test suites must pass unchanged.

#### Structural Verification (Manual)

**Skill installation verification:**

- [ ] `bmad-tea/SKILL.md` exists in inner project with same content as outer original
- [ ] `bmad-tea/customize.toml` exists with complete menu (all 9 entries)
- [ ] `bmad-tea/resources/` contains `tea-index.csv` and `knowledge/` subdirectory
- [ ] `bmad-testarch-trace/SKILL.md` exists with mode dispatch (C/R/V/E)
- [ ] `bmad-testarch-trace/customize.toml` exists
- [ ] `bmad-testarch-trace/steps-c/step-01-load-context.md` through `step-05-gate-decision.md` exist
- [ ] `bmad-testarch-trace/steps-e/` and `steps-v/` directories exist with step files
- [ ] `bmad-testarch-trace/trace-template.md`, `workflow.yaml`, `checklist.md`, `instructions.md` exist

**bmad-tea verification:**

- [ ] `customize.toml`: `persistent_facts` array has 2 entries (project-context.md + Memtrace fact)
- [ ] `customize.toml`: All 9 menu entries (TMT, TF, AT, TA, TD, TR, NR, CI, RV) unchanged
- [ ] `customize.toml`: Role, identity, communication_style, principles unchanged
- [ ] `SKILL.md`: Unchanged from outer original

**bmad-testarch-trace step-02 verification:**

- [ ] New subsection "3.5: Discover Structural Symbols (Memtrace)" present between sections 3 and 4
- [ ] Graceful degradation language present (advisory, skip if unavailable, partial state)
- [ ] `list_indexed_repositories` availability check required before queries
- [ ] `find_symbol` with kind filters (Function/Method/Class) specified
- [ ] `get_directory_tree` for module structure specified
- [ ] Anti-Promise.all language present
- [ ] `structural_symbol_inventory` JSON structure documented
- [ ] Existing sections 1-4 (Discover, Categorize, Heuristics, Save) preserved unchanged

**bmad-testarch-trace step-03 verification:**

- [ ] New subsection "1.5: Map Structural Symbols to Tests (Memtrace)" present between sections 1 and 2
- [ ] Cross-reference process documented (search test files for symbol names)
- [ ] Coverage status determination table present (FULL/PARTIAL/NONE/UNIT-ONLY/INTEGRATION-ONLY)
- [ ] Priority assignment based on export status and complexity
- [ ] `structural_coverage_matrix` structure documented
- [ ] Clear that structural matrix is SEPARATE from requirements matrix
- [ ] Graceful degradation for partial/unavailable state
- [ ] Existing sections 1-3 (Build Matrix, Validate, Save) preserved unchanged

**bmad-testarch-trace step-04 verification:**

- [ ] New subsection "2.5: Structural Coverage Gap Analysis (Memtrace)" present between sections 2 and 3
- [ ] Structural gap classification (exported=HIGH, internal=MEDIUM, critical risk=P0)
- [ ] Merging logic documented (structural gaps MERGE INTO existing arrays)
- [ ] Structural coverage statistics calculation (total, covered, uncovered, exported, priority breakdown)
- [ ] Structural recommendations appended to recommendations array
- [ ] Structural coverage added to `coverageMatrix` object
- [ ] Structural coverage added to Phase 1 summary display
- [ ] ALL existing sections 0-8 with code blocks preserved unchanged
- [ ] Orchestration mode resolution (auto/subagent/agent-team/sequential) unchanged
- [ ] Deduplicated test inventory logic unchanged

**trace-template.md verification:**

- [ ] "Structural Coverage Analysis" section present between "Coverage by Test Level" and "Traceability Recommendations"
- [ ] Structural Coverage Summary table present
- [ ] Detailed Symbol-Test Mapping section present
- [ ] Structural Gap Analysis section with priority levels
- [ ] Unavailable state handled (— Structural coverage analysis unavailable)
- [ ] Integrated YAML Snippet includes structural_coverage block
- [ ] ALL existing template sections preserved unchanged

**Cross-file consistency:**

- [ ] `structural_symbol_inventory` variable name consistent across all 3 step files
- [ ] `structural_coverage_matrix` variable name consistent across steps 03 and 04
- [ ] Graceful degradation pattern consistent (unavailable → skip, partial → apply to available data)
- [ ] Anti-Promise.all language consistent across all Memtrace query instructions
- [ ] No references to files or paths outside the target skill directories

#### Regression Tests (ALL must pass)

```bash
npm run quality
npm run validate:skills
```

```bash
node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs    # must pass
node --test _bmad/scripts/memtrace/qa-memtrace.test.mjs         # must pass
node --test _bmad/scripts/memtrace/validate-dead-code.test.mjs  # must pass
node --test _bmad/scripts/memtrace/memtrace-restart.test.mjs    # must pass
```

### References

- [Source: epics.md#Story 6.3] — User story: "Test Architect Coverage Gap Analysis"
- [Source: epics.md#FR14] — Test Architect Agent can cross-reference test files against graph symbols to identify test coverage gaps
- [Source: epics.md#Epic 6] — Epic goal: Multi-Agent Structural Intelligence; FR11-FR19
- [Source: prd.md#FR14] — Functional requirement: Test Architect coverage gap identification
- [Source: architecture.md#Memtrace MCP Tool Catalog] — Available tools: find_symbol, get_directory_tree, get_source_window, list_indexed_repositories
- [Source: architecture.md#Project Structure] — `.agents/skills/` for agent workflows
- [Source: architecture.md#Implementation Patterns] — Anti-Promise.all pattern, sequential for...of, kebab-case conventions
- [Source: architecture.md#Cross-Cutting Concerns] — Index Freshness Check mandatory before graph queries
- [Source: architecture.md#NFR1 Token Budget] — 2000 token limit
- [Source: architecture.md#NFR3 Reliability] — 10000ms timeout
- [Source: story-file 6.2] — Skill installation + modification pattern, graceful degradation, review patches applied
- [Source: story-file 6.1] — Persona + dispatch layer pattern (persistent fact only for dispatcher)
- [Source: bmad-tea/SKILL.md] — Murat persona definition, activation, dispatch via menu
- [Source: bmad-tea/customize.toml] — Agent config with 9-menu-item dispatch table
- [Source: bmad-testarch-trace/SKILL.md] — Tri-modal workflow (C/R/V/E), mode dispatch
- [Source: bmad-testarch-trace/steps-c/step-01-load-context.md] — Oracle resolution, knowledge loading
- [Source: bmad-testarch-trace/steps-c/step-02-discover-tests.md] — Test discovery, categorization, heuristic inventory
- [Source: bmad-testarch-trace/steps-c/step-03-map-criteria.md] — Traceability matrix building
- [Source: bmad-testarch-trace/steps-c/step-04-analyze-gaps.md] — Gap analysis, recommendations, Phase 1 completion
- [Source: bmad-testarch-trace/trace-template.md] — Comprehensive report template
- [Source: bmad-testarch-trace/workflow.yaml] — Workflow variables, config, output paths
- [Source: project-context.md] — Repository location: `D:\Repos\bmad-memtrace\bmad-memtrace` is the project root

## Dev Agent Record

### Agent Model Used

opencode-go/deepseek-v4-flash

### Debug Log References

- **Blast radius:** Empty — all modified files are markdown/TOML instruction files. No executable code symbols affected.
- **Mathematical Quality Gate:** SKIPPED (empty blast radius)
- **Dead Code Pitfall Validation:** SKIPPED (no dead-code removal in story)
- **Coverage threshold:** Flag-only mode (no uncovered threshold set)

### Completion Notes List

- **Task 1** (Skill installation): Copied `bmad-tea` (entire directory with 56+ knowledge resources) and `bmad-testarch-trace` (entire directory with 5 step files, 2 edit files, 1 validate file, template, workflow config) from outer `.agents/skills/` to inner project `.agents/skills/`. Verified complete file structures match originals.
- **Task 2** (bmad-tea customize.toml): Added Memtrace structural coverage persistent fact to `persistent_facts` array. All 9 menu entries (TMT, TF, AT, TA, TD, TR, NR, CI, RV) unchanged. Role, identity, communication_style, principles unchanged. Existing `project-context.md` entry preserved.
- **Task 3** (step-02-discover-tests.md): Added subsection "3.5: Discover Structural Symbols (Memtrace)" between sections 3 and 4. Instructions include availability check via `list_indexed_repositories`, exported symbol discovery via `find_symbol` (Function/Method/Class), `get_directory_tree` for module structure, `structural_symbol_inventory` JSON structure documentation, graceful degradation with "unavailable"/"partial"/"available" states, and anti-Promise.all enforcement.
- **Task 4** (step-03-map-criteria.md): Added subsection "1.5: Map Structural Symbols to Tests (Memtrace)" between sections 1 and 2. Cross-reference process documentation, coverage status determination table (FULL/PARTIAL/NONE/UNIT-ONLY/INTEGRATION-ONLY), priority assignment based on export status and complexity, `structural_coverage_matrix` structure documented. Clear separation from requirements matrix. Graceful degradation for partial/unavailable states.
- **Task 5** (step-04-analyze-gaps.md): Added subsection "2.5: Structural Coverage Gap Analysis (Memtrace)" between sections 2 and 3. Classification logic (exported=HIGH, internal=MEDIUM, critical risk=P0), structural gap merging into existing arrays, structural coverage statistics calculation, structural recommendations appended to recommendations array, `structural_coverage` field added to `coverageMatrix` object, structural coverage line added to Phase 1 summary display. ALL existing code blocks, orchestration logic, mode resolution, and save progress preserved unchanged.
- **Task 6** (trace-template.md): Added "Structural Coverage Analysis" template section between "Coverage by Test Level" and "Traceability Recommendations" with Structural Coverage Summary table, Detailed Symbol-Test Mapping, and Structural Gap Analysis (BLOCKER/HIGH/MEDIUM). Added structural_coverage block to Integrated YAML Snippet. ALL existing template sections preserved unchanged.
- **Task 7** (bmad-testarch-trace customize.toml): Added Memtrace structural coverage persistent fact. Existing `project-context.md` entry preserved.
- **Task 8** (Validation): Verified no SKILL.md files modified. All existing step instructions preserved unchanged. All Memtrace query points have graceful degradation. `npm run validate:skills` shows only pre-existing failures (44 skills, 134 findings — same as before this story).
- **Task 9** (Follow-up — self-contained context blocks): Added `## 🧠 Memtrace Context (Self-Contained)` block to 13 step files across 6 skills to eliminate script dependency for loading Memtrace context. Covers trace (3), code-review (2), gds-code-review (2), quick-dev (2), create-architecture source (2), check-implementation-readiness source (2). Each block contains tool references, usage patterns, graceful degradation rules, and anti-Promise.all enforcement inline.

### File List

| File                                                                                                 | Action     | Description                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `.agents/skills/bmad-tea/` (entire directory)                                                        | NEW (copy) | Murat Test Architect persona with full knowledge resources                                          |
| `.agents/skills/bmad-testarch-trace/` (entire directory)                                             | NEW (copy) | Coverage traceability workflow with 5 create-mode steps + edit/validate modes                       |
| `.agents/skills/bmad-tea/customize.toml`                                                             | UPDATE     | Added Memtrace structural coverage persistent fact                                                  |
| `.agents/skills/bmad-testarch-trace/customize.toml`                                                  | UPDATE     | Added Memtrace structural coverage persistent fact                                                  |
| `.agents/skills/bmad-testarch-trace/steps-c/step-02-discover-tests.md`                               | UPDATE     | Added subsection 3.5: Discover Structural Symbols (Memtrace)                                        |
| `.agents/skills/bmad-testarch-trace/steps-c/step-03-map-criteria.md`                                 | UPDATE     | Added subsection 1.5: Map Structural Symbols to Tests (Memtrace)                                    |
| `.agents/skills/bmad-testarch-trace/steps-c/step-04-analyze-gaps.md`                                 | UPDATE     | Added subsection 2.5: Structural Coverage Gap Analysis + structural recs + stats + matrix + summary |
| `.agents/skills/bmad-testarch-trace/trace-template.md`                                               | UPDATE     | Added Structural Coverage Analysis section + YAML snippet update                                    |
| `.agents/skills/bmad-testarch-trace/steps-c/step-02-discover-tests.md`                               | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/bmad-testarch-trace/steps-c/step-03-map-criteria.md`                                 | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/bmad-testarch-trace/steps-c/step-04-analyze-gaps.md`                                 | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/bmad-code-review/steps/step-01-gather-context.md`                                    | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/bmad-code-review/steps/step-02-review.md`                                            | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/gds-code-review/steps/step-01-gather-context.md`                                     | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/gds-code-review/steps/step-02-review.md`                                             | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/bmad-quick-dev/step-oneshot.md`                                                      | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `.agents/skills/bmad-quick-dev/step-03-implement.md`                                                 | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `src/bmm-skills/3-solutioning/bmad-create-architecture/steps/step-02-context.md`                     | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `src/bmm-skills/3-solutioning/bmad-create-architecture/steps/step-07-validation.md`                  | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `src/bmm-skills/3-solutioning/bmad-check-implementation-readiness/steps/step-02-prd-analysis.md`     | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |
| `src/bmm-skills/3-solutioning/bmad-check-implementation-readiness/steps/step-06-final-assessment.md` | UPDATE     | Added `## 🧠 Memtrace Context (Self-Contained)` block                                               |

### Change Log

**2026-05-21 — Story 6.3 implementation:**
Installed bmad-tea and bmad-testarch-trace skills with Memtrace structural coverage integration. Added persistent facts, structural symbol discovery (step-02), mapping (step-03), gap analysis (step-04), and template section. All 8 tasks completed. Story marked review.

**2026-05-21 — Follow-up: Self-contained Memtrace context blocks (13 files):**
Added `## 🧠 Memtrace Context (Self-Contained)` header blocks to ALL step files across ALL 6 Epic 6 skills that reference Memtrace. Each block contains workflow-specific tool references, usage patterns, graceful degradation rules, anti-Promise.all enforcement, and the complete 22-tool Memtrace catalog organized by category (Navigation, Architecture, Dependencies, Quality, Temporal, Index). Zero script dependency — each step file is self-sufficient. Touched files from stories 6.1, 6.2, and 6.3.
