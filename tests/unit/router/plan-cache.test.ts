import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildCacheKey, PlanCache, planCache } from '../../../src/router/index.js';
import type { GraphQuery } from '../../../src/types.js';

function makePlan(tool: string): GraphQuery[] {
  return [{ tool, arguments: { query: 'test' } }];
}

describe('PlanCache', () => {
  beforeEach(() => {
    planCache.reset();
  });

  it('get() returns undefined on empty cache', () => {
    const result = planCache.get('nonexistent');
    expect(result).toBeUndefined();
    expect(planCache.stats().misses).toBe(1);
  });

  it('set() + get() round-trip on same key', () => {
    const plan = makePlan('memtrace_find_code');
    planCache.set('find_code:abc123', plan);
    const result = planCache.get('find_code:abc123');
    expect(result).toEqual(plan);
    expect(planCache.stats().hits).toBe(1);
  });

  it('TTL expiry: stored entry older than 30s returns undefined on get()', () => {
    const cache = new PlanCache(1, 10);
    const plan = makePlan('memtrace_find_code');
    cache.set('key', plan);
    expect(cache.get('key')).toEqual(plan);

    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(2);
      const result = cache.get('key');
      expect(result).toBeUndefined();
      expect(cache.stats().misses).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('LRU eviction: inserting 101st entry evicts the least recently accessed', () => {
    const cache = new PlanCache(30_000, 5);
    const plan = makePlan('tool');

    for (let i = 0; i < 5; i++) {
      cache.set(`key_${i}`, plan);
    }

    cache.get('key_0');
    cache.get('key_1');

    cache.set('key_new', plan);

    expect(cache.get('key_0')).toEqual(plan);
    expect(cache.get('key_1')).toEqual(plan);
    expect(cache.get('key_2')).toBeUndefined();
    expect(cache.get('key_new')).toEqual(plan);
    expect(cache.stats().size).toBe(5);
  });

  it('stats() returns correct hit/miss/size counts', () => {
    const plan = makePlan('tool');
    planCache.set('a', plan);
    planCache.set('b', plan);

    planCache.get('a');
    planCache.get('a');
    planCache.get('c');

    const s = planCache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.size).toBe(2);
  });

  it('buildCacheKey produces same key for same args', () => {
    const args = { query: 'authenticateUser', lang: 'ts' };
    const key1 = buildCacheKey('find_code', args);
    const key2 = buildCacheKey('find_code', { query: 'authenticateUser', lang: 'ts' });
    expect(key1).toBe(key2);
    expect(key1).toMatch(/^find_code:[a-f0-9]{16}$/);
  });

  it('buildCacheKey produces different keys for different args', () => {
    const key1 = buildCacheKey('find_code', { query: 'user' });
    const key2 = buildCacheKey('find_code', { query: 'authenticateUser' });
    expect(key1).not.toBe(key2);
  });

  it('buildCacheKey includes intent_type in key prefix', () => {
    const args = { query: 'test' };
    const fc = buildCacheKey('find_code', args);
    const gi = buildCacheKey('get_impact', args);
    expect(fc.startsWith('find_code:')).toBe(true);
    expect(gi.startsWith('get_impact:')).toBe(true);
    expect(fc).not.toBe(gi);
  });
});
