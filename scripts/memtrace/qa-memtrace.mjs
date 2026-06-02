#!/usr/bin/env node

import { readFile } from 'fs/promises';
import { resolve } from 'path';

const TIMEOUT_MS = 10000;
const TIMEOUT_TOKEN = 'MEMTRACE_MCP_ERROR_TIMEOUT';

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: node qa-memtrace.mjs --blast-radius <file.json> --test-coverage <file.json> [--threshold N]

Arguments:
  --blast-radius <file>   Path to JSON file with get_impact output
  --test-coverage <file>  Path to JSON file with test coverage data
  --threshold N           Coverage threshold 0-100 (default: 100)

Exit codes:
  0  All required nodes covered (coverage >= threshold)
  1  Coverage insufficient or error

The output JSON includes: status, blast_radius_total, covered_nodes,
uncovered_nodes, coverage_percentage, threshold, passed, uncovered_details.`);
    process.exit(0);
  }

  const result = { blastRadius: null, testCoverage: null, threshold: 100 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--blast-radius' && i + 1 < args.length) {
      result.blastRadius = args[++i];
    } else if (args[i] === '--test-coverage' && i + 1 < args.length) {
      result.testCoverage = args[++i];
    } else if (args[i] === '--threshold' && i + 1 < args.length) {
      result.threshold = parseInt(args[++i], 10);
      if (isNaN(result.threshold) || result.threshold < 0 || result.threshold > 100) {
        fail(`Invalid threshold. Must be integer 0-100.`);
        process.exit(1);
      }
    } else {
      fail(`Unknown argument: ${args[i]}`);
      process.exit(1);
    }
  }

  if (!result.blastRadius) {
    fail('Missing --blast-radius');
    process.exit(1);
  }
  if (!result.testCoverage) {
    fail('Missing --test-coverage');
    process.exit(1);
  }

  return result;
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  console.log(TIMEOUT_TOKEN);
}

async function readJsonFile(filePath) {
  const resolved = resolve(filePath);
  try {
    return JSON.parse(await readFile(resolved, 'utf-8'));
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw new Error(`File not found: ${resolved}`);
    }
    throw err;
  }
}

function normalizeBlastData(raw) {
  const syms = Array.isArray(raw?.affected_symbols)
    ? raw.affected_symbols
    : Array.isArray(raw?.symbols)
      ? raw.symbols
      : [];
  const total =
    typeof raw?.total_count === 'number'
      ? raw.total_count
      : typeof raw?.total_count === 'string'
        ? Number(raw.total_count)
        : typeof raw?.total_affected === 'number'
          ? raw.total_affected
          : typeof raw?.total_affected === 'string'
            ? Number(raw.total_affected)
            : syms.length;
  return {
    symbols: syms.filter((s) => s != null && typeof s === 'object'),
    totalCount: total,
  };
}

function normalizeCoverageData(raw) {
  const mods = Array.isArray(raw?.modules)
    ? raw.modules
    : Array.isArray(raw?.coverage?.modules)
      ? raw.coverage.modules
      : [];
  return {
    modules: mods
      .filter((m) => m != null && typeof m === 'object')
      .map((m) => ({
        path: m?.module ?? m?.file ?? m?.path ?? '',
        coverage:
          typeof m?.coverage === 'string'
            ? m.coverage
            : typeof m?.status === 'string'
              ? m.status
              : 'None',
        symbolsCovered: Array.isArray(m?.symbols_covered)
          ? m.symbols_covered
          : Array.isArray(m?.covered_symbols)
            ? m.covered_symbols
            : Array.isArray(m?.covered)
              ? m.covered
              : [],
      })),
  };
}

function compute(rawBlastData, rawCoverageData, threshold) {
  const blastData = normalizeBlastData(rawBlastData);
  const coverageData = normalizeCoverageData(rawCoverageData);

  if (blastData.symbols.length === 0) {
    return {
      status: 'pass',
      blast_radius_total: 0,
      covered_nodes: 0,
      uncovered_nodes: 0,
      coverage_percentage: 100,
      threshold,
      passed: true,
      uncovered_details: [],
      elapsed_ms: 0,
      note: 'Empty blast radius — no nodes to intersect',
      total_count_reported: blastData.totalCount,
    };
  }

  const blastSet = new Map();
  for (const sym of blastData.symbols) {
    const key = `${sym.file}:${sym.name}`;
    blastSet.set(key, sym);
  }

  if (blastData.totalCount !== undefined && blastData.totalCount !== blastSet.size) {
    console.error(
      `WARNING: total_count mismatch: reported=${blastData.totalCount}, actual=${blastSet.size}`
    );
  }

  const coveredSet = new Set();
  for (const mod of coverageData.modules) {
    const modPath = mod.path || '';
    const cov = mod.coverage || '';

    if (cov === 'Yes') {
      for (const sym of mod.symbolsCovered || []) {
        if (blastSet.has(`${modPath}:${sym}`)) {
          coveredSet.add(`${modPath}:${sym}`);
        }
      }
    } else if (cov.startsWith('Partial:')) {
      const n = parseInt(cov.split(':')[1], 10) || 0;
      const covered = (mod.symbolsCovered || []).slice(0, n);
      for (const sym of covered) {
        if (blastSet.has(`${modPath}:${sym}`)) {
          coveredSet.add(`${modPath}:${sym}`);
        }
      }
    }
  }

  const uncoveredDetails = [];
  for (const [key, sym] of blastSet) {
    if (!coveredSet.has(key)) {
      uncoveredDetails.push({ symbol: sym.name, file: sym.file, depth: sym.depth });
    }
  }

  const total = blastSet.size;
  const covered = coveredSet.size;
  const uncovered = uncoveredDetails.length;
  const pct = total > 0 ? (covered / total) * 100 : 100;
  const passed = pct >= threshold;

  return {
    status: passed ? 'pass' : 'fail',
    blast_radius_total: total,
    covered_nodes: covered,
    uncovered_nodes: uncovered,
    coverage_percentage: Math.round(pct * 10) / 10,
    threshold,
    passed,
    uncovered_details: uncoveredDetails,
    elapsed_ms: 0,
    total_count_reported: blastData.totalCount,
  };
}

async function main() {
  const args = parseArgs();
  const start = Date.now();

  const rawBlast = await readJsonFile(args.blastRadius);
  const rawCoverage = await readJsonFile(args.testCoverage);

  // Normalize before validation to support adapter format evolution
  const blastData = normalizeBlastData(rawBlast);
  const coverageData = normalizeCoverageData(rawCoverage);

  if (!Array.isArray(blastData.symbols)) {
    throw new Error('Invalid blast-radius data: symbols array is required');
  }
  if (typeof blastData.totalCount !== 'number' || !Number.isFinite(blastData.totalCount)) {
    throw new Error('Invalid blast-radius data: total_count must be a finite number');
  }

  if (!Array.isArray(coverageData.modules)) {
    throw new Error('Invalid test-coverage data: modules array is required');
  }

  const result = compute(rawBlast, rawCoverage, args.threshold);
  result.elapsed_ms = Date.now() - start;

  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

const timeout = new Promise((_, reject) =>
  setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
);

Promise.race([main(), timeout]).catch((err) => {
  if (err?.message === 'TIMEOUT') {
    console.log(TIMEOUT_TOKEN);
  } else {
    fail(err?.message ?? String(err));
  }
  process.exit(1);
});
