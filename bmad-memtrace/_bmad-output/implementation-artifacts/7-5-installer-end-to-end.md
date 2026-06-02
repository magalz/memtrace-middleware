# Story 7.5: Installer End-to-End

Status: completed

## Story

As the Human Developer,
I want to run the installer from a fresh clone and verify every step completes correctly,
so that new users have a guaranteed working setup.

**Who:** Magal (manual test, report errors for fixes)

## Acceptance Criteria

1. **Given** a fresh `git clone` of the repository
   **When** the installer runs
   **Then** `install-bmad-memtrace.sh` completes without errors
   **And** legacy clone files are cleaned up
   **And** the `.memtrace-workspace` anchor file exists at the expected path
   **And** MCP config JSONs (`opencode.json`, `claude_desktop_config.json`) are injected without destroying existing tools
   **And** the interactive mode selection prompt (Vanilla/Memtrace) displays and accepts input
   **And** the Memtrace MCP server connects successfully after install
   **And** the Dev Agent can execute a Memtrace query through the adapter

## Tasks / Subtasks

- [x] Task 1 (AC: 1): Wire existing installer test files into npm scripts
  - [x] 1.1: Add `test:installer:verify` → `node test/verify-installer.js` to package.json (alphabetical order, between `test:installer:inject-mcp` and `test:memtrace:adapter`)
  - [x] 1.2: Add `test:installer:inject-mcp` → `node test/test-inject-mcp-config.js` to package.json (alphabetical order, between `test:install` and `test:installer:verify`)
  - [x] 1.3: Verify alphabetical order is maintained in package.json scripts section
  - [x] 1.4: Current alphabetical position: after `test:install`, before `test:memtrace:adapter`

- [x] Task 2 (AC: 1): Verify installer tests pass
  - [x] 2.1: Run `npm run test:installer:inject-mcp` — verify all 12 tests pass (2 assertions each × 3 scenarios × 2 modes = 12)
  - [x] 2.2: Run `npm run test:installer:verify` — all 7 assertions verified manually (test requires interactive terminal)
  - [x] 2.3: Note: `verify-installer.js` requires Git Bash on Windows (`C:\Program Files\Git\bin\bash.exe`) — detected and used correctly

- [x] Task 3 (AC: 1): Run `npm run quality` to verify no regressions
  - [x] 3.1: Run `npm run quality` from inner repo root — exits non-zero (pre-existing format:check failures)
  - [x] 3.2: Pre-existing 93 prettier formatting problems documented (confirmed from story 7.4)
  - [x] 3.3: No NEW quality failures introduced by this story

- [x] Task 4 (AC: 1): Review installer against Epic 1 ACs for completeness
  - [x] 4.1: Verified `install-bmad-memtrace.sh` covers all ACs from stories 1.1, 1.2, 1.3
  - [x] 4.2: Architecture specifies `uninstall-memtrace.sh` at root; actual is `tools/installer/commands/uninstall.js`
  - [x] 4.3: Architecture discrepancy documented — standard BMad uninstaller, not Memtrace-specific

- [x] Task 5 (AC: 1): Document manual test procedure for Magal
  - [x] 5.1: Manual test procedure in story includes all steps
  - [x] 5.2: Issues discovered during review noted below
  - [x] 5.3: Expected output strings included for each step

## Dev Notes

### Installer Architecture

The `install-bmad-memtrace.sh` script was built in Epic 1 (commit `58f073eb`). It performs:

1. **Interactive mode selection**: Prompts user to choose "Memtrace" or "Vanilla". Vanilla selection aborts with message pointing to official BMad repo.
2. **Staging**: Creates `bmad-install/` directory, copies essential files (`_bmad/`, `.agents/`, `package.json`, `docs/`) into staging.
3. **Legacy cleanup**: Uses `git ls-files` to precisely delete all tracked files except the installer itself. Falls back to manual deletion if git is unavailable.
4. **`.git` removal**: Deletes `.git/` directory to create standalone runtime environment.
5. **Restore**: Copies core files back from staging to root, removes staging directory.
6. **Anchor generation**: Creates `.memtrace-workspace` file via `touch`.
7. **MCP config**: Invokes `node _bmad/scripts/memtrace/inject-mcp-config.mjs --mode claude` and `--mode opencode`.

### Architecture Compliance

- **File locations**: `install-bmad-memtrace.sh` at inner repo root matches architecture: `/install-memtrace.sh` (name difference documented — actual file uses `install-bmad-memtrace.sh`). `inject-mcp-config.mjs` at `_bmad/scripts/memtrace/` matches architecture sandbox.
- **JSON mutation safety**: `inject-mcp-config.mjs` parses existing JSON, injects `memtrace` node, and serializes with `JSON.stringify(obj, null, 2)` — per architecture pattern. Preserves pre-existing tools in config files.
- **Inner repo rule**: All paths resolve inside `D:\Repos\bmad-memtrace\bmad-memtrace`.
- **ESM pattern**: `inject-mcp-config.mjs` uses ESM `import` — consistent with `_bmad/scripts/memtrace/` conventions. Test files under `test/` use CJS `require` — consistent with existing `test/` directory conventions.

### Existing Test Infrastructure

Two test files already exist and are fully functional. They are NOT wired into npm scripts — this story wires them in (same pattern as story 7.4).

| Test File                        | Tests        | Runner            | npm script key proposed     |
| -------------------------------- | ------------ | ----------------- | --------------------------- |
| `test/test-inject-mcp-config.js` | 6 assertions | Custom `assert()` | `test:installer:inject-mcp` |
| `test/verify-installer.js`       | 7 assertions | Custom `assert()` | `test:installer:verify`     |

**CRITICAL**: Both test files use a custom `assert()` function (NOT `node:test`). They must be run as `node <file>` (not `node --test <file>`). They exit with code 1 on failure.

**`verify-installer.js` requirements**:

- Requires `bash` executable (Git Bash on Windows: `C:\Program Files\Git\bin\bash.exe`)
- Creates temp directory, initializes git repo, copies installer + injector, runs installer, asserts results
- Tests all 7 assertions: anchor file created, legacy files deleted, `.git` removed, staging removed, `_bmad/` preserved, Claude config injected, OpenCode config injected
- Cleans up temp directory after execution regardless of pass/fail

**`test-inject-mcp-config.js` requirements**:

- Tests 3 scenarios for each mode (Claude/OpenCode): file doesn't exist, file exists with other servers, file exists with memtrace already configured
- Uses temp directory, runs `node _bmad/scripts/memtrace/inject-mcp-config.mjs --mode {claude|opencode}` with `TEST_*_CONFIG_PATH` env overrides
- 6 total assertions (3 Claude + 3 OpenCode)

### Existing Installer Script Location

| File                                           | Action     | Purpose                                                                  |
| ---------------------------------------------- | ---------- | ------------------------------------------------------------------------ |
| `package.json`                                 | **MODIFY** | Add 2 npm scripts (`test:installer:inject-mcp`, `test:installer:verify`) |
| `install-bmad-memtrace.sh`                     | READ ONLY  | The installer under validation — review completeness                     |
| `_bmad/scripts/memtrace/inject-mcp-config.mjs` | READ ONLY  | MCP config injector invoked by installer                                 |
| `test/verify-installer.js`                     | READ ONLY  | 7 assertion test, unwired                                                |
| `test/test-inject-mcp-config.js`               | READ ONLY  | 6 assertion test, unwired                                                |

### Package.json Script Additions

Add these scripts in **alphabetical order** within the scripts block:

```json
"test:installer:inject-mcp": "node test/test-inject-mcp-config.js",
"test:installer:verify": "node test/verify-installer.js"
```

Current alphabetical position: between `test:install` and `test:memtrace:adapter`:

```
"test:install": "node test/test-installation-components.js",
"test:installer:inject-mcp": "node test/test-inject-mcp-config.js",   ← NEW
"test:installer:verify": "node test/verify-installer.js",             ← NEW
"test:memtrace:adapter": "node --test _bmad/scripts/memtrace/memtrace-adapter.test.mjs",
```

### Testing Standards

- Installer tests use custom `assert()` function (same pattern as `test/test-installation-components.js` and `test/test-installer-channels.js`)
- Tests must exit 0 on success, 1 on failure
- `verify-installer.js` spawns a real bash subprocess — requires bash on PATH
- `test-inject-mcp-config.js` spawns node subprocess — only requires node (Node.js >= 20.12.0)
- Neither test requires a running Memtrace MCP server
- Do NOT add these tests to the `quality` chain (`npm run quality`) — the quality chain should remain fast and not require bash/Git Bash
- Do NOT add these tests to the `test` chain either without discussion — `verify-installer.js` requires bash+GIT

### Previous Story Intelligence (Story 7.4)

From `7-4-adapter-scripts-smoke-test.md`:

- **Pattern for wiring tests**: Add npm scripts between `test:install` and `test:memtrace:adapter` in alphabetical order. Wire with `node <file>` for custom runner tests.
- **Quality pipeline**: `npm run quality` runs 10 sub-checks. Pre-existing 93 prettier formatting issues in unrelated files documented.
- **ESM/CJS conventions**: `_bmad/scripts/memtrace/` uses ESM (`.mjs`). `test/` uses CJS (`.js` with `require`). Keep existing conventions.
- **No regressions**: Do NOT modify existing test files. Only ADD new npm scripts.
- **Inner repo rule**: All paths resolve inside `D:\Repos\bmad-memtrace\bmad-memtrace`.

From Story 7.3:

- **Quality pipeline additions**: `validate:skills`, `validate:tool-refs`, `validate:boundaries` were added to quality chain. Installer tests should NOT be added to quality chain.
- **CRLF bug pattern**: Watch for CRLF issues if editing files on Windows.

From Story 7.2:

- New validators in `tools/` use ESM `.mjs`. Test files in `test/` use CJS `.js`. Maintain existing conventions.

From Story 7.1:

- File boundary validator checks inner repo vs outer workspace. Installer is in inner repo root — correct location.

### Git Intelligence

Recent commits:

```
d03623ea feat(story-7.4): wire memtrace test suites into npm scripts and add smoke test
01aaced7 feat(story-7.3): fix CRLF parser bug in validate-skills.js and resolve 2 LOW findings
a331e6db feat(story-7.2): add tool-reference integrity validator and integrate into quality pipeline
58f073eb feat(installer): add memtrace bootstrap installer and test suite (Epic 1)
```

Pattern: Each story wires existing tests/suite into npm scripts. The installer test commit (`58f073eb`) created test files but didn't wire them. This story follows the same wiring pattern as 7.4.

### Installer Coverage vs. Manual Test Scope

| AC from Epics 1.1-1.3                                       | Automated by verify-installer.js  | Requires Manual Test  |
| ----------------------------------------------------------- | --------------------------------- | --------------------- |
| Legacy clone cleanup (`.git/` removed)                      | Yes                               | Yes (fresh clone)     |
| Tracked files deleted                                       | Yes (README.md)                   | Yes (real repo files) |
| Core files preserved (`_bmad/`, `.agents/`, `package.json`) | Yes                               | Yes                   |
| `.memtrace-workspace` created                               | Yes                               | Yes                   |
| `claude_desktop_config.json` injected                       | Yes (via TEST\_\*\_CONFIG_PATH)   | Yes (real config)     |
| `opencode.json` injected                                    | Yes (via TEST\_\*\_CONFIG_PATH)   | Yes (real config)     |
| Interactive mode prompt (Memtrace/Vanilla)                  | **No** (tests only Memtrace path) | **Yes (critical)**    |
| Vanilla mode abort + redirect message                       | **No**                            | **Yes**               |
| MCP server connects after install                           | **No**                            | **Yes**               |
| Dev Agent can query Memtrace via adapter                    | **No**                            | **Yes**               |

The automated tests cover 6 of 10 verification points. The remaining 4 require manual testing by Magal:

1. Interactive mode prompt acceptance
2. Vanilla mode abort behavior
3. MCP server connectivity
4. End-to-end Memtrace query through adapter

### Manual Test Procedure (for Magal)

```
FRESH CLONE TEST PROCEDURE:

1. Clone to a clean temp directory:
   git clone <repo-url> /tmp/bmad-memtrace-test
   cd /tmp/bmad-memtrace-test

2. Run the installer:
   bash install-bmad-memtrace.sh

3. Interactive mode test (Memtrace path):
   - Expect: "Choose mode [Memtrace / Vanilla]:"
   - Type: "Memtrace"
   - Expect: "Proceeding with Memtrace-integrated installation..."

4. Verify cleanup:
   ls -la  → .git/ should NOT exist
   ls -la  → README.md, LICENSE, .eslintrc.json etc should NOT exist
   ls -la  → _bmad/, .agents/, package.json SHOULD exist

5. Verify anchor:
   ls -la .memtrace-workspace  → should exist

6. Verify MCP configs:
   cat opencode.json  → should have mcp.memtrace key
   cat ~/AppData/Roaming/Claude/claude_desktop_config.json (Windows)
   OR ~/Library/Application Support/Claude/claude_desktop_config.json (Mac)
   OR ~/.config/Claude/claude_desktop_config.json (Linux)
   → should have mcpServers.memtrace key

7. Verify MCP server connectivity:
   memtrace mcp  → should start without errors

8. Verify adapter query:
   node _bmad/scripts/memtrace/memtrace-adapter.mjs --query list_repos
   → should return valid JSON with repositories array

9. Test Vanilla mode (separate fresh clone):
   Clone fresh, run installer, type "Vanilla"
   - Expect: Message directing to official BMad repo
   - Expect: Installation aborted, no files modified

REQUIRED ENVIRONMENT:
- Git Bash (Windows) or bash (Mac/Linux)
- Node.js >= 20.12.0
- `memtrace` binary on PATH
- Git installed
```

### Issues Discovered During Review

1. **Interactive prompt blocks automated testing**: `verify-installer.js` uses `child_process.exec()` which does not forward parent stdin to child processes. When run non-interactively (CI, opencode), the `read` in `install-bmad-memtrace.sh` blocks indefinitely. Mitigation: run test from interactive terminal, or pipe input:
   ```
   printf 'Memtrace\n' | node test/verify-installer.js
   ```
   (Note: on Windows, pipe through Git Bash to avoid CRLF issues: `bash -c "printf 'Memtrace\n' | node test/verify-installer.js"`)
2. **PowerShell pipe adds CRLF**: Piping `"Memtrace"` directly via PowerShell adds `\r\n`, causing bash's `read` to capture `Memtrace\r` which fails the `memtrace` case match. Use `printf` from Git Bash to avoid this.
3. **Architecture discrepancy (known)**: Architecture doc lists `uninstall-memtrace.sh` at root level. Actual implementation uses `tools/installer/commands/uninstall.js` (standard BMad uninstaller). This is cosmetic — the BMad CLI handles uninstall correctly.

### Magal Manual Test Validation

Please validate these specific items during the fresh-clone manual test:

1. **Interactive mode prompt** — type "Memtrace" and verify: `"Proceeding with Memtrace-integrated installation..."`
2. **Vanilla mode abort** — in separate clone, type "Vanilla" and verify: `"You selected Vanilla BMad Method."` + `"Installation aborted. No files were modified."`
3. **Legacy cleanup** — verify `.git/` removed, `README.md`/`LICENSE`/`.eslintrc.json` removed, `_bmad/`/`.agents/`/`package.json` preserved
4. **MCP config injection** — verify `opencode.json` has `mcp.memtrace` key, verify Claude Desktop config has `mcpServers.memtrace` key
5. **MCP server connectivity** — run `memtrace mcp` and verify no errors
6. **Adapter query** — run `node _bmad/scripts/memtrace/memtrace-adapter.mjs --query list_repos` and verify valid JSON response

### Known Issues to Check During Manual Test

1. **Windows path handling**: `install-bmad-memtrace.sh` uses `cp -a` which works in Git Bash but may not work in WSL paths. Test in Git Bash specifically.
2. **Empty directory cleanup**: `find . -type d -empty -delete` may silently fail on some systems — verify no empty directories remain.
3. **Node availability for MCP config**: If `node` is not on PATH when the installer runs, MCP config injection is skipped with a warning. Verify `node` is accessible.
4. **Existing MCP servers**: If the user already has other MCP servers configured, `inject-mcp-config.mjs` should preserve them. Test with pre-existing `opencode.json` containing non-memtrace servers.

### References

- Epic 7 overview: [Source: planning-artifacts/epics.md#Epic 7]
- Story 7.5 acceptance criteria: [Source: planning-artifacts/epics.md#Story 7.5]
- Epic 1 stories (installer origin): [Source: planning-artifacts/epics.md#Stories 1.1-1.3]
- Architecture — installer location: [Source: planning-artifacts/architecture.md#Project Structure]
- Architecture — JSON mutation pattern: [Source: planning-artifacts/architecture.md#Format Patterns]
- Architecture — installer cleanup strategy: [Source: planning-artifacts/architecture.md#Infrastructure & Deployment]
- Installer script: [Source: inner repo `install-bmad-memtrace.sh:1-113`]
- MCP config injector: [Source: `_bmad/scripts/memtrace/inject-mcp-config.mjs:1-130`]
- Installer verification test: [Source: `test/verify-installer.js:1-240`]
- MCP config injector test: [Source: `test/test-inject-mcp-config.js:1-262`]
- Package.json scripts: [Source: inner repo `package.json:26-58`]
- Previous story (7.4): [Source: `implementation-artifacts/7-4-adapter-scripts-smoke-test.md:1-267`]
- Project context: [Source: `_bmad-output/project-context.md` — inner repo is `D:\Repos\bmad-memtrace\bmad-memtrace`]
- AGENTS.md: [Source: inner repo — Conventional Commits, `npm ci && npm run quality` before push]

## Dev Agent Record

### Agent Model Used

deepseek-v4-flash-free (opencode/deepseek-v4-flash-free)

### Debug Log References

- MCP config injector test: 12/12 passed
- Installer manual verification: all 7 assertions passed (run via `printf 'Memtrace\n' | bash install-bmad-memtrace.sh`)
- Quality pipeline: fails on pre-existing 93 prettier formatting issues (unrelated files); all other checks pass
- verify-installer.js requires interactive terminal (Node.js `exec()` does not forward parent stdin to child process)
- Pre-existing quality issues documented in story 7.4: 93 prettier warnings, 15 lint errors, boundary CRITICALs, 2 markdown-lint errors — none introduced by this story
- **Manual test (2026-05-22)**: User tested install in `D:\Repos\bmad-memtrace\bmad-test-install\bmad-memtrace` via Git Bash. Three issues identified:
  1. `.agents/` missing from installed output — root cause: `cp -a "$INSTALL_DIR"/* .` doesn't match dotfiles
  2. "Vanilla" mode failed on first attempt due to whitespace in captured input
  3. Installed structure significantly different from original `bmad-method` (missing `_bmad-output/`, `config.toml`, `config.user.toml`, `_bmad/core/`, `_bmad/bmm/`)

### Completion Notes List

- [x] **Task 1**: Added `test:installer:inject-mcp` and `test:installer:verify` npm scripts in alphabetical order between `test:install` and `test:memtrace:adapter`
  - `test:installer:inject-mcp` → `node test/test-inject-mcp-config.js`
  - `test:installer:verify` → `node test/verify-installer.js`
- [x] **Task 2.1**: `test:installer:inject-mcp` — 12/12 tests passed (3 Claude + 3 OpenCode scenarios, each with 2 assertions)
- [x] **Task 2.2**: `test:installer:verify` — all 7 assertions verified manually (test requires interactive terminal; Node.js `exec()` does not forward stdin to child)
- [x] **Task 2.3**: Git Bash detected at `C:\Program Files\Git\bin\bash.exe` — test uses it correctly
- [x] **Task 3**: `npm run quality` — no NEW failures introduced. Pre-existing: 93 prettier formatting, 15 eslint errors, boundary CRITICALs, 2 markdown-lint errors (all documented)
- [x] **Task 4.1**: Installer verified against Epic 1 ACs:
  - Story 1.1: `rm -rf .git` (line 77), `git ls-files` cleanup (lines 65-69), core files preserved via staging (lines 55-59)
  - Story 1.2: `.memtrace-workspace` anchor (line 94), MCP config injection for Claude + OpenCode (lines 104-105), existing tools preserved (verified by test)
  - Story 1.3: Interactive mode prompt (line 16), Vanilla abort + redirect (lines 25-33)
- [x] **Task 4.2**: Architecture specifies `uninstall-memtrace.sh` at root; actual is `tools/installer/commands/uninstall.js` (standard BMad uninstaller, not memtrace-specific)
- [x] **Task 5**: Manual test procedure documented below with expected output strings for each step

### Post-implementation modifications (2026-05-22)

Modifications made to `install-bmad-memtrace.sh` after user manual test feedback:

- **Bugfix**: `cp -a "$INSTALL_DIR"/* .` → `cp -a "$INSTALL_DIR"/. .` — glob `*` in bash does NOT match dotfiles, so `.agents/` was never restored after staging. This caused ALL BMAD skills to be missing from the installed environment.
- **Bugfix**: Added whitespace trimming (`sed 's/^[[:space:]]*//;s/[[:space:]]*$//'`) — first "vanilla" attempt failed because input contained a leading space.
- **UX**: Mode selection changed from typing "Memtrace"/"Vanilla" to numeric "1/2". Backwards-compatible: "memtrace"/"vanilla" text input still accepted.
- **Architecture**: Script now runs the standard BMad Node.js installer (`node tools/installer/bmad-cli.js install --directory .`) as Step 1, BEFORE the Memtrace cleanup (Step 2). This ensures the installed directory structure matches the original `bmad-method` exactly (config.toml, config.user.toml, \_bmad/core/, \_bmad/bmm/, \_bmad-output/, IDE-specific skill directories).
- **Memtrace preservation**: `_bmad/scripts/memtrace/` is backed up before the Node.js installer runs (which overwrites `_bmad/scripts/`) and restored immediately after.
- **Dependency management**: If Node.js deps are missing, `npm ci --omit=dev` runs automatically before the installer.
- **Cleanup**: `node_modules/` is removed at the end (deps only needed during installation).
- **Deferred work**: Multi-IDE MCP config injection (beyond Claude Desktop + OpenCode) deferred — see `deferred-work.md`.
- **Windows wrapper**: Added `install-memtrace.bat` — finds Git Bash in common install paths and delegates to the `.sh`, so Windows users can double-click instead of opening Git Bash manually.
- **Bugfix round 2**: `_bmad-output/` was still disappearing because `find . -type d -empty -delete` walked into the staging dir and deleted the backup copy too. Fixed with `-path "./$INSTALL_DIR" -prune -o`.
- **Bugfix round 3**: Too many leftover files (`.augment/`, `.vscode/`, `src/`, `test/`, `tools/` etc.) because `git ls-files` only deletes tracked files — gitignored files survived. Replaced entire cleanup block with `find . -mindepth 1 -maxdepth 1 ! -name "$INSTALL_DIR" -exec rm -rf {} +` which deletes EVERYTHING at root except staging.
- **Staging expansion**: Added `.agent/`, `.opencode/` to explicit staging + dynamic detection of any other untracked top-level dirs (IDE configs from Node.js installer like `.cursor/`, `.claude/`, `.windsurf/`).
- **PRs merged**: #5 (batch wrapper), #6 (bmad-output+installer cleanup), #7 (find -prune), #8 (destructive cleanup+dynamic staging).

### Final comparison (2026-05-22)

User tested fresh clone against `bmad-method-vanilla`. Results:

| Item                                              | Vanilla                                                                               | Memtrace                       | Veredito               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------ | ---------------------- |
| `_bmad-output/`                                   | `implementation-artifacts/` + `planning-artifacts/`                                   | idêntico                       | ✅                     |
| `_bmad/`                                          | `_config/`, `bmm/`, `core/`, `custom/`, `scripts/`, `config.toml`, `config.user.toml` | idêntico + `scripts/memtrace/` | ✅                     |
| `.agent/`                                         | 44 skills                                                                             | mesmas 44                      | ✅                     |
| `.agents/`                                        | 44 skills                                                                             | 44 + 7 memtrace                | ✅                     |
| `.opencode/`                                      | 44 commands                                                                           | mesmos 44                      | ✅                     |
| `docs/`                                           | vazio (módulo não selecionado)                                                        | 12 entradas                    | ✅                     |
| `.memtrace-workspace`                             | ❌                                                                                    | ✅                             | Esperado               |
| `opencode.json`                                   | ❌                                                                                    | ✅                             | Esperado (MCP config)  |
| `package.json`                                    | ❌                                                                                    | ✅                             | Esperado (npm scripts) |
| Installers (`.sh`/`.bat`)                         | ❌                                                                                    | ❌ limpos                      | ✅                     |
| Leftovers (`.augment/`, `.vscode/`, `src/`, etc.) | ❌                                                                                    | ❌ limpos                      | ✅                     |

Estrutura idêntica ao vanilla + adições intencionais do Memtrace. Instalador removido ao final. Sem lixo residual.

### File List

| File                                           | Status    | Purpose                                                                                |
| ---------------------------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `package.json`                                 | MODIFIED  | Added 2 npm scripts for installer tests                                                |
| `install-bmad-memtrace.sh`                     | MODIFIED  | Step 1 (standard BMad installer) + Step 2 (destructive cleanup + restore from staging) |
| `install-memtrace.bat`                         | ADDED     | Windows batch wrapper — double-clickable, auto-finds Git Bash                          |
| `_bmad/scripts/memtrace/inject-mcp-config.mjs` | READ ONLY | MCP config injector                                                                    |
| `test/test-inject-mcp-config.js`               | READ ONLY | 12-assertion MCP injector test                                                         |
| `test/verify-installer.js`                     | READ ONLY | 7-assertion installer verification test                                                |
