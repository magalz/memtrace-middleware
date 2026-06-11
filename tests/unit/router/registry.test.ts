import { describe, it, expect, beforeEach } from 'vitest';

import { IntentRegistry } from '../../../src/router/types.js';
import type { IntentDefinition } from '../../../src/router/types.js';

describe('IntentRegistry', () => {
  let registry: IntentRegistry;

  beforeEach(() => {
    registry = new IntentRegistry();
  });

  describe('constructor', () => {
    it('registers all 12 default intents on construction', () => {
      const intents = registry.list();
      expect(intents).toHaveLength(12);
    });

    it('populates toolToIntent map with default tool mappings', () => {
      expect(registry.toolToIntent.get('memtrace_find_code')).toBe('find_code');
      expect(registry.toolToIntent.get('memtrace_get_impact')).toBe('get_impact');
      expect(registry.toolToIntent.get('memtrace_get_symbol_context')).toBe('get_symbol_context');
    });

    it('populates toolToArgKey map with default argKey mappings', () => {
      expect(registry.toolToArgKey.get('memtrace_find_code')).toBe('query');
      expect(registry.toolToArgKey.get('memtrace_get_impact')).toBe('target');
      expect(registry.toolToArgKey.get('memtrace_get_symbol_context')).toBe('symbol');
    });

    it('populates intentToTracePrefix map with default prefixes', () => {
      expect(registry.intentToTracePrefix.get('find_code')).toBe('fc');
      expect(registry.intentToTracePrefix.get('get_impact')).toBe('gi');
      expect(registry.intentToTracePrefix.get('get_symbol_context')).toBe('gsc');
    });
  });

  describe('register', () => {
    it('adds an intent definition to intents map', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['custom pattern'],
        tools: [{ name: 'custom_tool', argKey: 'query' }],
      };
      registry.register(def);
      expect(registry.get('custom_intent')).toEqual(def);
    });

    it('populates toolToIntent for each tool in the intent', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['custom pattern'],
        tools: [{ name: 'custom_tool', argKey: 'query' }],
      };
      registry.register(def);
      expect(registry.toolToIntent.get('custom_tool')).toBe('custom_intent');
    });

    it('populates toolToArgKey for each tool in the intent', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['custom pattern'],
        tools: [{ name: 'custom_tool', argKey: 'target' }],
      };
      registry.register(def);
      expect(registry.toolToArgKey.get('custom_tool')).toBe('target');
    });

    it('populates intentToTracePrefix when traceIdPrefix is set', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['custom pattern'],
        tools: [{ name: 'custom_tool', argKey: 'query' }],
        traceIdPrefix: 'ci',
      };
      registry.register(def);
      expect(registry.intentToTracePrefix.get('custom_intent')).toBe('ci');
    });

    it('does NOT set intentToTracePrefix when traceIdPrefix is undefined', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['custom pattern'],
        tools: [{ name: 'custom_tool', argKey: 'query' }],
      };
      registry.register(def);
      expect(registry.intentToTracePrefix.get('custom_intent')).toBeUndefined();
    });

    it('updates all 4 maps atomically (re-registration replaces old mappings)', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['custom pattern'],
        tools: [{ name: 'tool_a', argKey: 'query' }],
        traceIdPrefix: 'ci',
      };
      registry.register(def);
      const def2: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['updated pattern'],
        tools: [{ name: 'tool_b', argKey: 'symbol' }],
        traceIdPrefix: 'up',
      };
      registry.register(def2);

      expect(registry.get('custom_intent')).toEqual(def2);
      expect(registry.toolToIntent.get('tool_a')).toBeUndefined();
      expect(registry.toolToIntent.get('tool_b')).toBe('custom_intent');
      expect(registry.toolToArgKey.get('tool_b')).toBe('symbol');
      expect(registry.intentToTracePrefix.get('custom_intent')).toBe('up');
    });

    it('filters empty/whitespace-only patterns', () => {
      const def: IntentDefinition = {
        type: 'custom_intent',
        patterns: ['valid pattern', '', '  ', '\t'],
        tools: [{ name: 'custom_tool', argKey: 'query' }],
      };
      registry.register(def);
      const stored = registry.get('custom_intent')!;
      expect(stored.patterns).toHaveLength(1);
      expect(stored.patterns).toEqual(['valid pattern']);
    });

    it('is idempotent — registering same type+tool twice does not duplicate mappings', () => {
      const def: IntentDefinition = {
        type: 'find_code',
        patterns: ['find code'],
        tools: [{ name: 'memtrace_find_code', argKey: 'query' }],
        traceIdPrefix: 'fc',
      };
      registry.register(def);
      registry.register(def);
      const intents = registry.list();
      expect(intents.filter((d) => d.type === 'find_code')).toHaveLength(1);
      expect(registry.toolToIntent.get('memtrace_find_code')).toBe('find_code');
    });

    it('handles multiple tools per intent', () => {
      const def: IntentDefinition = {
        type: 'multi_tool_intent',
        patterns: ['multi tool'],
        tools: [
          { name: 'tool_1', argKey: 'query' },
          { name: 'tool_2', argKey: 'symbol' },
        ],
        traceIdPrefix: 'mt',
      };
      registry.register(def);
      expect(registry.toolToIntent.get('tool_1')).toBe('multi_tool_intent');
      expect(registry.toolToIntent.get('tool_2')).toBe('multi_tool_intent');
      expect(registry.toolToArgKey.get('tool_1')).toBe('query');
      expect(registry.toolToArgKey.get('tool_2')).toBe('symbol');
    });
  });

  describe('getIntentForTool', () => {
    it('returns correct intent type for known tool', () => {
      expect(registry.getIntentForTool('memtrace_find_code')).toBe('find_code');
    });

    it('returns undefined for unknown tool', () => {
      expect(registry.getIntentForTool('nonexistent_tool')).toBeUndefined();
    });
  });

  describe('getArgKeyForTool', () => {
    it('returns correct argKey for known tool', () => {
      expect(registry.getArgKeyForTool('memtrace_get_impact')).toBe('target');
    });

    it('returns undefined for unknown tool', () => {
      expect(registry.getArgKeyForTool('nonexistent_tool')).toBeUndefined();
    });
  });

  describe('getTraceIdPrefix', () => {
    it('returns correct trace ID prefix for known intent', () => {
      expect(registry.getTraceIdPrefix('find_code')).toBe('fc');
    });

    it('returns undefined for unknown intent type', () => {
      expect(registry.getTraceIdPrefix('unknown_intent')).toBeUndefined();
    });
  });

  describe('unregister', () => {
    it('removes intent from intents map', () => {
      registry.unregister('find_code');
      expect(registry.get('find_code')).toBeUndefined();
    });

    it('removes tool-to-intent mappings for unregistered intent', () => {
      registry.unregister('find_code');
      expect(registry.toolToIntent.get('memtrace_find_code')).toBeUndefined();
    });

    it('removes tool-to-argKey mappings for unregistered intent', () => {
      registry.unregister('find_code');
      expect(registry.toolToArgKey.get('memtrace_find_code')).toBeUndefined();
    });

    it('removes trace prefix mapping for unregistered intent', () => {
      registry.unregister('find_code');
      expect(registry.intentToTracePrefix.get('find_code')).toBeUndefined();
    });

    it('is a no-op for unknown intent type', () => {
      const countBefore = registry.list().length;
      registry.unregister('nonexistent_intent' as const);
      expect(registry.list()).toHaveLength(countBefore);
    });

    it('does not affect other intents when unregistering', () => {
      registry.unregister('find_code');
      expect(registry.get('get_impact')).toBeDefined();
      expect(registry.toolToIntent.get('memtrace_get_impact')).toBe('get_impact');
    });
  });

  describe('reset', () => {
    it('clears all maps and restores default 12 intents', () => {
      registry.clear();
      expect(registry.list()).toHaveLength(0);

      registry.reset();
      expect(registry.list()).toHaveLength(12);
      expect(registry.getIntentForTool('memtrace_find_code')).toBe('find_code');
    });

    it('removes custom intents and restores original defaults', () => {
      registry.register({
        type: 'custom_intent',
        patterns: ['custom'],
        tools: [{ name: 'custom_tool', argKey: 'query' }],
      });
      expect(registry.list()).toHaveLength(13);

      registry.reset();
      expect(registry.list()).toHaveLength(12);
      expect(registry.toolToIntent.get('custom_tool')).toBeUndefined();
    });

    it('restores original tool mappings after modification', () => {
      registry.register({
        type: 'find_code',
        patterns: ['modified'],
        tools: [{ name: 'memtrace_find_code', argKey: 'modified_arg' }],
        traceIdPrefix: 'xx',
      });

      registry.reset();
      expect(registry.getArgKeyForTool('memtrace_find_code')).toBe('query');
      expect(registry.getTraceIdPrefix('find_code')).toBe('fc');
    });
  });

  describe('clear', () => {
    it('removes all intents', () => {
      registry.clear();
      expect(registry.list()).toHaveLength(0);
    });

    it('removes all toolToIntent mappings', () => {
      registry.clear();
      expect(registry.toolToIntent.size).toBe(0);
    });

    it('removes all toolToArgKey mappings', () => {
      registry.clear();
      expect(registry.toolToArgKey.size).toBe(0);
    });

    it('removes all intentToTracePrefix mappings', () => {
      registry.clear();
      expect(registry.intentToTracePrefix.size).toBe(0);
    });
  });

  describe('list', () => {
    it('returns array of registered intents', () => {
      const intents = registry.list();
      expect(Array.isArray(intents)).toBe(true);
      expect(intents).toHaveLength(12);
    });

    it('reflects newly registered intents', () => {
      registry.register({
        type: 'extra_intent',
        patterns: ['extra'],
        tools: [{ name: 'extra_tool', argKey: 'query' }],
      });
      expect(registry.list()).toHaveLength(13);
    });
  });
});
