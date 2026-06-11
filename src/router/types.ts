export type IntentType = 'find_code' | 'get_symbol_context' | 'get_impact' | (string & {});

export interface IntentDefinition {
  type: IntentType;
  patterns: string[];
  tools: Array<{ name: string; argKey: string }>;
  traceIdPrefix?: string;
  confidenceWeight?: number;
}

const DEFAULT_INTENTS: IntentDefinition[] = [
  {
    type: 'find_code',
    patterns: ['find code', 'search for', 'locate', 'where is', 'find function', 'find class'],
    tools: [{ name: 'memtrace_find_code', argKey: 'query' }],
    traceIdPrefix: 'fc',
  },
  {
    type: 'get_impact',
    patterns: [
      'impact of',
      'blast radius',
      'what breaks',
      'what depends on',
      'upstream',
      'downstream',
    ],
    tools: [
      { name: 'memtrace_get_impact', argKey: 'target' },
      { name: 'memtrace_find_code', argKey: 'query' },
    ],
    traceIdPrefix: 'gi',
  },
  {
    type: 'get_symbol_context',
    patterns: [
      'context of',
      'what calls',
      'callers of',
      'callees of',
      'symbol context',
      'dependencies of',
    ],
    tools: [
      { name: 'memtrace_find_code', argKey: 'query' },
      { name: 'memtrace_get_symbol_context', argKey: 'symbol' },
      { name: 'memtrace_get_impact', argKey: 'target' },
    ],
    traceIdPrefix: 'gsc',
  },
  {
    type: 'review_code',
    patterns: [
      'review',
      'pull request',
      'code review',
      'AST issues',
      'reviewer patterns',
      'lint check',
      'static analysis',
    ],
    tools: [{ name: 'find_ast_review_issues', argKey: 'query' }],
    traceIdPrefix: 'rc',
  },
  {
    type: 'get_style_fingerprint',
    patterns: [
      'code style',
      'project conventions',
      'naming patterns',
      'this project uses',
      'match the style',
    ],
    tools: [{ name: 'get_style_fingerprint', argKey: 'query' }],
    traceIdPrefix: 'gsf',
  },
  {
    type: 'find_dead_code',
    patterns: ['dead code', 'unused function', 'unused method', 'orphan code', 'zero callers', 'unreachable'],
    tools: [{ name: 'memtrace_find_dead_code', argKey: 'query' }],
    traceIdPrefix: 'dc',
  },
  {
    type: 'get_evolution',
    patterns: ['code evolution', 'recent changes', 'what changed', 'change history', 'evolution of', 'last modified'],
    tools: [{ name: 'memtrace_get_evolution', argKey: 'query' }],
    traceIdPrefix: 'ev',
  },
  {
    type: 'get_process_flow',
    patterns: ['process flow', 'execution path', 'pipeline', 'data flow', 'call chain', 'end to end flow', 'request lifecycle'],
    tools: [{ name: 'memtrace_get_process_flow', argKey: 'process' }],
    traceIdPrefix: 'pf',
  },
  {
    type: 'get_api_topology',
    patterns: ['API topology', 'service dependency', 'http call graph', 'REST surface', 'endpoint map', 'service architecture'],
    tools: [{ name: 'memtrace_get_api_topology', argKey: 'query' }],
    traceIdPrefix: 'at',
  },
  {
    type: 'find_bridge_symbols',
    patterns: ['bridge symbols', 'architectural chokepoint', 'bottleneck functions', 'critical connectors'],
    tools: [{ name: 'memtrace_find_bridge_symbols', argKey: 'query' }],
    traceIdPrefix: 'bs',
  },
  {
    type: 'find_central_symbols',
    patterns: ['central symbols', 'PageRank', 'most important functions', 'core functions', 'high centrality', 'key symbols'],
    tools: [{ name: 'memtrace_find_central_symbols', argKey: 'query' }],
    traceIdPrefix: 'cs',
  },
  {
    type: 'find_dependency_path',
    patterns: ['dependency path', 'shortest call chain', 'path from', 'how does', 'call path between'],
    tools: [{ name: 'memtrace_find_dependency_path', argKey: 'query' }],
    traceIdPrefix: 'dp',
  },
];

export class IntentRegistry {
  private intents: Map<IntentType, IntentDefinition> = new Map();
  readonly toolToIntent: Map<string, string> = new Map();
  readonly toolToArgKey: Map<string, string> = new Map();
  readonly intentToTracePrefix: Map<string, string> = new Map();

  constructor() {
    for (const def of DEFAULT_INTENTS) {
      this.register(def);
    }
  }

  register(def: IntentDefinition): void {
    const cleanPatterns = def.patterns.filter((p) => p && p.trim().length > 0);
    if (cleanPatterns.length !== def.patterns.length) {
      def = { ...def, patterns: cleanPatterns };
    }

    if (this.intents.has(def.type)) {
      const oldDef = this.intents.get(def.type)!;
      for (const tool of oldDef.tools) {
        if (this.toolToIntent.get(tool.name) === def.type) {
          this.toolToIntent.delete(tool.name);
          this.toolToArgKey.delete(tool.name);
        }
      }
      this.intentToTracePrefix.delete(def.type);
    }

    this.intents.set(def.type, def);

    for (const tool of def.tools) {
      if (!this.toolToIntent.has(tool.name)) {
        this.toolToIntent.set(tool.name, def.type);
        this.toolToArgKey.set(tool.name, tool.argKey);
      }
    }

    if (def.traceIdPrefix) {
      this.intentToTracePrefix.set(def.type, def.traceIdPrefix);
    }
  }

  list(): IntentDefinition[] {
    return Array.from(this.intents.values());
  }

  get(type: IntentType): IntentDefinition | undefined {
    return this.intents.get(type);
  }

  getIntentForTool(toolName: string): string | undefined {
    return this.toolToIntent.get(toolName);
  }

  getArgKeyForTool(toolName: string): string | undefined {
    return this.toolToArgKey.get(toolName);
  }

  getTraceIdPrefix(intentType: string): string | undefined {
    return this.intentToTracePrefix.get(intentType);
  }

  clear(): void {
    this.intents.clear();
    this.toolToIntent.clear();
    this.toolToArgKey.clear();
    this.intentToTracePrefix.clear();
  }

  /** Removes a single intent type */
  unregister(type: IntentType): void {
    const def = this.intents.get(type);
    if (def) {
      for (const tool of def.tools) {
        this.toolToIntent.delete(tool.name);
        this.toolToArgKey.delete(tool.name);
      }
      this.intentToTracePrefix.delete(type);
    }
    this.intents.delete(type);
  }

  /** Resets to the default intents (currently 12), removing any custom registrations */
  reset(): void {
    this.intents.clear();
    this.toolToIntent.clear();
    this.toolToArgKey.clear();
    this.intentToTracePrefix.clear();
    for (const def of DEFAULT_INTENTS) {
      this.register(def);
    }
  }
}
