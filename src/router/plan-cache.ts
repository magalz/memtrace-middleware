import { createHash, randomUUID } from 'node:crypto';

import { DEDUP_CACHE_TTL_MS } from '../constants.js';
import type { GraphQuery } from '../types.js';

interface CacheEntry {
  queryPlan: GraphQuery[];
  createdAt: number;
  sequence: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

export function buildCacheKey(intentType: string, args: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(args);
  } catch {
    return `${intentType}:${randomUUID().slice(0, 16)}`;
  }
  const hash = createHash('sha256')
    .update(serialized)
    .digest('hex')
    .slice(0, 16);
  return `${intentType}:${hash}`;
}

export class PlanCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly ttl: number;
  private readonly maxSize: number;
  private nextSequence = 0;
  private hits = 0;
  private misses = 0;

  constructor(ttl = DEDUP_CACHE_TTL_MS, maxSize = 100) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  get(key: string): GraphQuery[] | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() - entry.createdAt > this.ttl) {
      this.store.delete(key);
      this.misses++;
      return undefined;
    }

    entry.sequence = this.nextSequence++;
    this.hits++;
    return entry.queryPlan.map((q) => ({ ...q, arguments: { ...q.arguments } }));
  }

  set(key: string, plan: GraphQuery[]): void {
    if (this.store.size >= this.maxSize) {
      this.evictLRU();
    }

    this.store.set(key, {
      queryPlan: plan,
      createdAt: Date.now(),
      sequence: this.nextSequence++,
    });
  }

  reset(): void {
    this.store.clear();
    this.nextSequence = 0;
    this.hits = 0;
    this.misses = 0;
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }

  stats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.store.size,
    };
  }

  private evictLRU(): void {
    let oldestKey: string | undefined;
    let oldestSeq = Infinity;

    for (const [k, entry] of this.store) {
      if (entry.sequence < oldestSeq) {
        oldestSeq = entry.sequence;
        oldestKey = k;
      }
    }

    if (oldestKey !== undefined) {
      this.store.delete(oldestKey);
    }
  }
}

export const planCache = new PlanCache();
