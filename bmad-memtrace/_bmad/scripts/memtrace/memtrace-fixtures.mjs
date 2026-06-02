export const fixtures = {
  get_impact: (target) => ({
    target,
    risk: 'Medium',
    affected_symbols: [
      { name: 'caller1', file: 'src/router/classify.ts', line: 42, depth: 1, complexity_score: 5 },
      {
        name: 'caller2',
        file: 'src/interface/base-adapter.ts',
        line: 128,
        depth: 1,
        complexity_score: 3,
      },
      { name: 'indirect1', file: 'src/cli/status.ts', line: 56, depth: 2, complexity_score: 7 },
      { name: 'critical1', file: 'src/index.ts', line: 12, depth: 1, complexity_score: 15 },
      {
        name: 'caller3',
        file: 'tests/integration/roundtrip.test.ts',
        line: 33,
        depth: 1,
        complexity_score: 2,
      },
    ],
    affected_files: [
      'src/router/classify.ts',
      'src/interface/base-adapter.ts',
      'src/cli/status.ts',
      'src/index.ts',
      'tests/integration/roundtrip.test.ts',
    ],
    total_affected: 5,
  }),

  find_code: (query) => ({
    results: [
      {
        name: 'authenticateUser',
        file_path: 'src/auth/auth.ts',
        start_line: 45,
        kind: 'Function',
        complexity_score: 8,
      },
      {
        name: 'validateSession',
        file_path: 'src/auth/session.ts',
        start_line: 12,
        kind: 'Function',
        complexity_score: 4,
      },
      {
        name: 'UserToken',
        file_path: 'src/types/token.ts',
        start_line: 3,
        kind: 'Interface',
        complexity_score: 1,
      },
    ],
  }),

  find_dead_code: (target) => ({
    symbols: [
      {
        name: 'deprecatedHelper',
        kind: 'Function',
        file: 'src/utils/old-helpers.ts',
        line: 12,
        complexity_score: 2,
        risk_level: 'Low',
      },
      {
        name: 'unusedParser',
        kind: 'Function',
        file: 'src/parser/legacy.ts',
        line: 45,
        complexity_score: 8,
        risk_level: 'Medium',
      },
      {
        name: 'deadExporter',
        kind: 'Function',
        file: 'src/export/stale.ts',
        line: 78,
        complexity_score: 3,
        risk_level: 'Low',
      },
    ],
  }),

  get_symbol_context: (symbol) => ({
    callers: [
      { name: 'main', file: 'src/index.ts', line: 12 },
      { name: 'classifyIntent', file: 'src/router/classify.ts', line: 87 },
      { name: 'executeQuery', file: 'src/executor/executor.ts', line: 45 },
    ],
    callees: [
      { name: 'validateInput', file: 'src/validator/validate.ts', line: 23 },
      { name: 'resolveTemplate', file: 'src/template/resolve.ts', line: 56 },
      { name: 'emitTelemetry', file: 'src/telemetry/emit.ts', line: 34 },
    ],
    communities: ['router-community', 'executor-community'],
    processes: ['main-query-pipeline'],
  }),

  list_repos: () => ({
    repos: [
      {
        repo_id: 'bmad-memtrace',
        last_indexed_at: new Date().toISOString(),
        total_nodes: 842,
      },
      {
        repo_id: 'old-project',
        last_indexed_at: new Date(Date.now() - 86400000).toISOString(),
        total_nodes: 120,
      },
    ],
  }),

  memtrace_check_freshness: () => ({
    is_fresh: true,
    age_minutes: 2,
    last_indexed: new Date().toISOString(),
  }),
};
