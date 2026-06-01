export type IntentType = 'find_code' | 'get_symbol_context' | 'get_impact' | (string & {});

export interface IntentDefinition {
  type: IntentType;
  patterns: string[];
  tools: string[];
  confidenceWeight?: number;
}

const DEFAULT_INTENTS: IntentDefinition[] = [
  {
    type: 'find_code',
    patterns: ['find code', 'search for', 'locate', 'where is', 'find function', 'find class'],
    tools: ['memtrace_find_code'],
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
    tools: ['memtrace_find_code', 'memtrace_get_symbol_context', 'memtrace_get_impact'],
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
    tools: ['memtrace_get_impact', 'memtrace_find_code'],
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
    tools: ['find_ast_review_issues'],
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
    tools: ['get_style_fingerprint'],
  },
];

export class IntentRegistry {
  private intents: Map<IntentType, IntentDefinition> = new Map();

  constructor() {
    for (const def of DEFAULT_INTENTS) {
      this.register(def);
    }
  }

  register(def: IntentDefinition): void {
    this.intents.set(def.type, def);
  }

  list(): IntentDefinition[] {
    return Array.from(this.intents.values());
  }

  get(type: IntentType): IntentDefinition | undefined {
    return this.intents.get(type);
  }

  clear(): void {
    this.intents.clear();
  }

  /** Removes a single intent type */
  unregister(type: IntentType): void {
    this.intents.delete(type);
  }

  /** Resets to the default intents (currently 5), removing any custom registrations */
  reset(): void {
    this.intents.clear();
    for (const def of DEFAULT_INTENTS) {
      this.register(def);
    }
  }
}
