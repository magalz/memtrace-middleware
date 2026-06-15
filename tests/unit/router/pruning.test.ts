import { describe, it, expect } from 'vitest';
import {
  pruneHistory,
  type ConversationTurn,
  type ConversationHistory,
  type PruningConfig,
} from '../../../src/router/pruning.js';

function makeTurn(
  messageText: string,
  symbols: string[],
  opts?: { memfleet_annotation?: string }
): ConversationTurn {
  return {
    timestamp: new Date().toISOString(),
    message_text: messageText,
    symbols,
    memfleet_annotation: opts?.memfleet_annotation,
  };
}

function makeMessage(query?: string, name?: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (query !== undefined) args.query = query;
  if (name !== undefined) args.name = name;
  return {
    params: {
      arguments: args,
    },
  };
}

const DEFAULT_CONFIG: PruningConfig = {
  enabled: true,
  max_turn_threshold: 20,
  recency_window: 5,
};

describe('pruneHistory', () => {
  // 8.2: Empty history
  it('returns empty result for empty history', () => {
    const result = pruneHistory([], makeMessage('some query'), DEFAULT_CONFIG);
    expect(result.pruned).toEqual([]);
    expect(result.stats.pruned_count).toBe(0);
    expect(result.stats.retained_count).toBe(0);
    expect(result.stats.recency_count).toBe(0);
    expect(result.stats.structural_count).toBe(0);
    expect(result.stats.memfleet_count).toBe(0);
    expect(result.stats.tokens_saved_estimate).toBe(0);
  });

  // 8.3: History below threshold — no-op
  it('returns history unchanged when below threshold', () => {
    const history: ConversationHistory = Array.from({ length: 5 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, [])
    );
    const result = pruneHistory(history, makeMessage('query'), DEFAULT_CONFIG);
    expect(result.pruned.length).toBe(5);
    expect(result.stats.pruned_count).toBe(0);
    expect(result.stats.retained_count).toBe(5);
  });

  // 8.4: Recency rule — 25 turns, recency=5 → last 5 retained
  it('retains last recency_window turns', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, [])
    );
    const result = pruneHistory(history, makeMessage('query'), DEFAULT_CONFIG);
    expect(result.pruned.length).toBe(5);
    expect(result.pruned[0]!.message_text).toBe('turn 21');
    expect(result.pruned[4]!.message_text).toBe('turn 25');
    expect(result.stats.recency_count).toBe(5);
  });

  // 8.5: Structural rule — symbol matches current query
  it('retains turns with symbol matching current query', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 2 ? ['processPayment'] : [])
    );
    const result = pruneHistory(
      history,
      makeMessage('find processPayment implementation'),
      DEFAULT_CONFIG
    );
    // Turn 3 (index 2) is outside recency (only turns 21-25, indices 20-24, are recency)
    // Turn 3 has symbol 'processPayment' which matches query
    expect(result.pruned.find((t) => t.message_text === 'turn 3')).toBeDefined();
  });

  // 8.6: Case-insensitive structural match
  it('matches symbols case-insensitively', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 3 ? ['AUTHENTICATEUSER'] : [])
    );
    const result = pruneHistory(
      history,
      makeMessage('find authenticateUser in auth module'),
      DEFAULT_CONFIG
    );
    expect(result.pruned.find((t) => t.message_text === 'turn 4')).toBeDefined();
  });

  // 8.7: Non-overlapping symbol not retained
  it('does not retain turns with non-matching symbols', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 1 ? ['unrelatedSymbol'] : [])
    );
    const result = pruneHistory(history, makeMessage('find processPayment'), DEFAULT_CONFIG);
    expect(result.pruned.find((t) => t.message_text === 'turn 2')).toBeUndefined();
  });

  // 8.8: Structural rule — symbol in name field
  it('retains turns matching symbols in message name field', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 5 ? ['processPayment'] : [])
    );
    const result = pruneHistory(history, makeMessage(undefined, 'processPayment'), DEFAULT_CONFIG);
    expect(result.pruned.find((t) => t.message_text === 'turn 6')).toBeDefined();
  });

  // 8.9: MemFleet annotation retention
  it('retains turns with memfleet_annotation regardless of recency', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, [], i === 0 ? { memfleet_annotation: 'active' } : undefined)
    );
    const result = pruneHistory(history, makeMessage('some query'), DEFAULT_CONFIG);
    expect(result.pruned.find((t) => t.message_text === 'turn 1')).toBeDefined();
    expect(result.stats.memfleet_count).toBe(1);
  });

  // 8.10: Combined — recency + structural dedup
  it('deduplicates turns in both recency and structural', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) => {
      if (i >= 20) {
        // All recency turns also carry a symbol that might match
        return makeTurn(`turn ${i + 1}`, i === 22 ? ['processPayment'] : []);
      }
      return makeTurn(`turn ${i + 1}`, i === 2 ? ['findCode'] : []);
    });
    // Query matches turn 3 (structural, outside recency)
    // Turn 23 (index 22) is in recency already
    const result = pruneHistory(history, makeMessage('findCode implementation'), DEFAULT_CONFIG);
    // Turn 3 (index 2) retained by structural
    expect(result.pruned.find((t) => t.message_text === 'turn 3')).toBeDefined();
    // Turn 21-25 all in recency
    expect(result.pruned.filter((t) => t.message_text.startsWith('turn 2')).length).toBe(5);
    // Total: 5 recency + 1 structural (turn 3)
    expect(result.stats.retained_count).toBe(6);
    expect(result.stats.recency_count).toBe(5);
    expect(result.stats.structural_count).toBe(1);
  });

  // 8.11: No duplicate retention
  it('retains each turn only once', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) => {
      if (i === 22) {
        return makeTurn(`turn ${i + 1}`, ['uniqueSym']);
      }
      return makeTurn(`turn ${i + 1}`, []);
    });
    // Turn 23 (index 22) is in recency AND has matching symbol
    // Should be retained once, counted toward recency (recency checked before structural)
    const result = pruneHistory(history, makeMessage('uniqueSym'), DEFAULT_CONFIG);
    const turn23s = result.pruned.filter((t) => t.message_text === 'turn 23');
    expect(turn23s.length).toBe(1);
    expect(result.stats.recency_count).toBe(5);
    expect(result.stats.structural_count).toBe(0);
  });

  // 8.12: Stats accuracy
  it('reports accurate pruning stats', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 1 ? ['processPayment'] : [])
    );
    const result = pruneHistory(history, makeMessage('processPayment'), DEFAULT_CONFIG);
    expect(result.stats.pruned_count + result.stats.retained_count).toBe(25);
    expect(
      result.stats.recency_count + result.stats.structural_count + result.stats.memfleet_count
    ).toBe(result.stats.retained_count);
  });

  // 8.13: tokens_saved_estimate
  it('computes tokens_saved_estimate from pruned message lengths', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, [])
    );
    const result = pruneHistory(history, makeMessage('query'), DEFAULT_CONFIG);
    expect(result.stats.tokens_saved_estimate).toBeGreaterThan(0);
    // 20 turns pruned, each message "turn X" is ~6 chars → ~120 estimated tokens
    expect(result.stats.tokens_saved_estimate).toBeGreaterThanOrEqual(80);
  });

  // 8.14: Zero recency — only structural and memfleet
  it('retains only structural and memfleet turns when recency is zero', () => {
    const config: PruningConfig = { enabled: true, max_turn_threshold: 20, recency_window: 0 };
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 3 ? ['processPayment'] : [])
    );
    const result = pruneHistory(history, makeMessage('processPayment'), config);
    expect(result.pruned.length).toBe(1);
    expect(result.stats.recency_count).toBe(0);
    expect(result.stats.structural_count).toBe(1);
  });

  // 8.15: Message with no text fields — structural returns 0
  it('returns only recency when message has no query or name', () => {
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 2 ? ['someSym'] : [])
    );
    const result = pruneHistory(history, makeMessage(), DEFAULT_CONFIG);
    expect(result.pruned.length).toBe(5);
    expect(result.stats.recency_count).toBe(5);
    expect(result.stats.structural_count).toBe(0);
  });

  // 8.16: Disabled config
  it('returns full history unchanged when pruning is disabled', () => {
    const config: PruningConfig = { enabled: false, max_turn_threshold: 20, recency_window: 5 };
    const history: ConversationHistory = Array.from({ length: 25 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, [])
    );
    const result = pruneHistory(history, makeMessage('any query'), config);
    expect(result.pruned.length).toBe(25);
    expect(result.stats.pruned_count).toBe(0);
    expect(result.stats.tokens_saved_estimate).toBe(0);
  });

  // Exact threshold boundary — no pruning when equal
  it('does not prune when history equals max_turn_threshold', () => {
    const config: PruningConfig = { enabled: true, max_turn_threshold: 20, recency_window: 5 };
    const history: ConversationHistory = Array.from({ length: 20 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, [])
    );
    const result = pruneHistory(history, makeMessage('query'), config);
    expect(result.pruned.length).toBe(20);
    expect(result.stats.pruned_count).toBe(0);
  });

  // Large history performance
  it('handles large history (1000 turns) without errors', () => {
    const history: ConversationHistory = Array.from({ length: 1000 }, (_, i) =>
      makeTurn(`turn ${i + 1}`, i === 500 ? ['targetSymbol'] : [])
    );
    const result = pruneHistory(history, makeMessage('targetSymbol'), DEFAULT_CONFIG);
    expect(result.pruned.length).toBeGreaterThan(0);
    // Recency window should be preserved
    expect(result.pruned.find((t) => t.message_text === 'turn 996')).toBeDefined();
    // Structural match outside recency
    expect(result.pruned.find((t) => t.message_text === 'turn 501')).toBeDefined();
  });
});
