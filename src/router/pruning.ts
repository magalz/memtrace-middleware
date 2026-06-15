import type { PruningStats } from '../types.js';

export interface ConversationTurn {
  timestamp: string;
  message_text: string;
  symbols: string[];
  memfleet_annotation?: string;
}

export type ConversationHistory = ConversationTurn[];

export interface PruningConfig {
  max_turn_threshold: number;
  recency_window: number;
  enabled: boolean;
}

export type { PruningStats };

function getQueryText(message: Record<string, unknown>): string {
  const params = message.params as Record<string, unknown> | undefined;
  const args = params?.arguments as Record<string, unknown> | undefined;
  const parts: string[] = [];
  if (args?.query && typeof args.query === 'string') {
    parts.push(args.query);
  }
  if (args?.name && typeof args.name === 'string') {
    parts.push(args.name);
  }
  return parts.join(' ');
}

function symbolMatchesQuery(symbol: string, queryText: string): boolean {
  if (!symbol || !queryText) return false;
  return queryText.toLowerCase().includes(symbol.toLowerCase());
}

export function pruneHistory(
  history: ConversationHistory,
  currentMessage: Record<string, unknown>,
  config: PruningConfig
): { pruned: ConversationHistory; stats: PruningStats } {
  if (!config.enabled || history.length <= config.max_turn_threshold) {
    return {
      pruned: [...history],
      stats: {
        pruned_count: 0,
        retained_count: history.length,
        recency_count: 0,
        structural_count: 0,
        memfleet_count: 0,
        tokens_saved_estimate: 0,
      },
    };
  }

  const queryText = getQueryText(currentMessage);
  const totalLen = history.length;
  const recencyStart = Math.max(0, totalLen - config.recency_window);

  const retained: ConversationHistory = [];
  let recencyCount = 0;
  let structuralCount = 0;
  let memfleetCount = 0;

  for (let i = 0; i < totalLen; i++) {
    const turn = history[i]!;
    let retainedTurn = false;

    // MemFleet rule: highest priority
    if (turn.memfleet_annotation) {
      retained.push(turn);
      retainedTurn = true;
      memfleetCount++;
      continue;
    }

    // Recency rule
    if (i >= recencyStart) {
      retained.push(turn);
      retainedTurn = true;
      recencyCount++;
      continue;
    }

    // Structural rule: outside recency window, match by symbol
    if (queryText.length > 0) {
      for (const sym of turn.symbols) {
        if (symbolMatchesQuery(sym, queryText)) {
          retained.push(turn);
          retainedTurn = true;
          structuralCount++;
          break;
        }
      }
    }

    // Explicitly exclude — not retained by any rule
    void retainedTurn;
  }

  const prunedCount = totalLen - retained.length;
  const tokenEstimate = history
    .filter((_, i) => {
      // A turn is pruned if it is NOT in the retained set
      // Since we built retained in order, we check by index
      return !retained.includes(history[i]!);
    })
    .reduce((sum, t) => sum + t.message_text.length, 0);

  return {
    pruned: retained,
    stats: {
      pruned_count: prunedCount,
      retained_count: retained.length,
      recency_count: recencyCount,
      structural_count: structuralCount,
      memfleet_count: memfleetCount,
      tokens_saved_estimate: tokenEstimate,
    },
  };
}
