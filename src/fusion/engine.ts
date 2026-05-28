import { createLogger } from '../logger.js';
import type { ContextBlock, FusedContext, FusedInput, QueryResult, Result } from '../types.js';

const log = createLogger('fusion');

function extractBlocks(results: QueryResult[]): ContextBlock[] {
  const blocks: ContextBlock[] = [];

  for (const result of results) {
    if (result.degraded) continue;
    if (result.data == null) continue;

    let items: Record<string, unknown>[];

    if (Array.isArray(result.data)) {
      items = result.data as Record<string, unknown>[];
    } else if (typeof result.data === 'object') {
      const data = result.data as Record<string, unknown>;
      const subArrays: string[] = ['callers', 'callees', 'affected_symbols'];
      const combined: Record<string, unknown>[] = [];
      let foundAny = false;
      for (const key of subArrays) {
        if (Array.isArray(data[key])) {
          foundAny = true;
          for (const item of data[key] as unknown[]) {
            if (item == null) continue;
            if (typeof item === 'object') {
              combined.push(item as Record<string, unknown>);
            } else {
              combined.push({ name: String(item) });
            }
          }
        }
      }
      items = foundAny ? combined : [data];
    } else {
      log.debug('skip_primitive_data', { tool: result.tool, trace_id: result.trace_id });
      continue;
    }

    for (const item of items) {
      if (item == null || typeof item !== 'object') continue;

      const symbol =
        typeof item.name === 'string'
          ? item.name
          : typeof item.symbol === 'string'
            ? (item.symbol as string)
            : 'unknown';

      blocks.push({
        symbol,
        file_path: typeof item.file_path === 'string' ? (item.file_path as string) : '',
        start_line: typeof item.start_line === 'number' ? (item.start_line as number) : 0,
        end_line: typeof item.end_line === 'number' ? (item.end_line as number) : 0,
        centrality: typeof item.centrality === 'number' ? (item.centrality as number) : 0,
        query_type: result.tool,
      });
    }
  }

  return blocks;
}

function deduplicate(blocks: ContextBlock[]): ContextBlock[] {
  const seen = new Map<string, ContextBlock>();
  for (const block of blocks) {
    const key = `${block.symbol}::${block.file_path}::${block.start_line}`;
    const existing = seen.get(key);
    if (!existing || block.centrality > existing.centrality) {
      seen.set(key, block);
    }
  }
  return [...seen.values()];
}

function rank(blocks: ContextBlock[]): ContextBlock[] {
  return [...blocks].sort((a: ContextBlock, b: ContextBlock) => {
    if (b.centrality !== a.centrality) return b.centrality - a.centrality;
    return a.symbol.localeCompare(b.symbol);
  });
}

function annotate(blocks: ContextBlock[]): string[] {
  return blocks.map(
    (b) =>
      `[memtrace: grounded via ${b.query_type} → ${b.symbol} at ${b.file_path}:${b.start_line}]`
  );
}

export function fuse(input: FusedInput): Result<FusedContext> {
  const results = input.results;
  const intentType = input.intent_type;

  if (!Array.isArray(results) || results.length === 0) {
    return {
      ok: true,
      value: {
        blocks: [],
        partial: false,
        trace_id: '',
        provenance: [],
      },
    };
  }

  const valid = results.filter((r) => !r.degraded);
  const hasDegraded = results.length !== valid.length;

  const blocks = extractBlocks(valid);
  const deduped = deduplicate(blocks);
  const ranked = rank(deduped);
  const provenance = annotate(ranked);

  const traceId = results[0]?.trace_id ?? '';

  log.info('fusion_complete', {
    intent_type: intentType,
    input_results: results.length,
    valid_results: valid.length,
    degraded_results: results.length - valid.length,
    extracted_blocks: blocks.length,
    deduped_blocks: deduped.length,
    partial: hasDegraded,
  });

  return {
    ok: true,
    value: {
      blocks: ranked,
      partial: hasDegraded,
      trace_id: traceId,
      provenance,
    },
  };
}
