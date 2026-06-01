#!/usr/bin/env node
import { strict as assert } from 'assert';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const SCRIPT_PATH = join(fileURLToPath(new URL('.', import.meta.url)), 'qa-memtrace.mjs');
const TMP = tmpdir();

function runScript(br, tc, threshold) {
  const brPath = join(TMP, `br-${Date.now()}.json`);
  const tcPath = join(TMP, `tc-${Date.now()}.json`);
  try {
    writeFileSync(brPath, JSON.stringify(br), 'utf8');
    writeFileSync(tcPath, JSON.stringify(tc), 'utf8');
    const args = ['--blast-radius', brPath, '--test-coverage', tcPath];
    if (threshold !== undefined) args.push('--threshold', String(threshold));
    const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args], { encoding: 'utf8', timeout: 5000 });
    const stdout = result.stdout ? result.stdout.trim() : '';
    const stderr = result.stderr ? result.stderr.trim() : '';
    let parsed;
    try { parsed = JSON.parse(stdout); }
    catch { parsed = { status: 'error', error: stdout }; }
    return { exitCode: result.status ?? 1, output: parsed, stderr };
  } finally {
    try { unlinkSync(brPath); } catch {}
    try { unlinkSync(tcPath); } catch {}
  }
}

function makeBr(symbols) {
  return { target: 'test', risk_level: 'Low', affected_symbols: symbols, total_count: symbols.length };
}

function makeTc(modules) {
  return { modules, coverage_summary: { total_modules: modules.length } };
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  V ${name}`); }
  catch (e) { failed++; console.log(`  X ${name}: ${e.message}`); }
}

console.log('qa-memtrace.mjs Test Suite\n');

test('all nodes covered', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1}]);
  const tc = makeTc([{module:'src/a.ts',test_files:['test/a.test.ts'],symbols_covered:['foo'],coverage:'Yes'}]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.passed, true);
  assert.equal(r.output.covered_nodes, 1);
  assert.equal(typeof r.output.elapsed_ms, 'number');
  assert.ok(r.output.elapsed_ms >= 0);
});

test('some nodes uncovered', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1},{name:'bar',file:'src/b.ts',depth:2}]);
  const tc = makeTc([{module:'src/a.ts',test_files:['test/a.test.ts'],symbols_covered:['foo'],coverage:'Yes'},{module:'src/b.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 1);
  assert.equal(r.output.passed, false);
  assert.equal(r.output.uncovered_nodes, 1);
});

test('threshold met (50% with threshold 50)', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1},{name:'bar',file:'src/b.ts',depth:2}]);
  const tc = makeTc([{module:'src/a.ts',test_files:['test/a.test.ts'],symbols_covered:['foo'],coverage:'Yes'},{module:'src/b.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc, 50);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.passed, true);
  assert.equal(r.output.coverage_percentage, 50);
});

test('coverage below threshold (50% with threshold 80)', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1},{name:'bar',file:'src/b.ts',depth:2}]);
  const tc = makeTc([{module:'src/a.ts',test_files:['test/a.test.ts'],symbols_covered:['foo'],coverage:'Yes'},{module:'src/b.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc, 80);
  assert.equal(r.exitCode, 1);
  assert.equal(r.output.passed, false);
});

test('empty blast radius', () => {
  const br = makeBr([]);
  const tc = makeTc([]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.passed, true);
  assert.ok(r.output.note.includes('Empty blast radius'));
});

test('no test coverage at all', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1},{name:'bar',file:'src/b.ts',depth:2}]);
  const tc = makeTc([{module:'src/a.ts',test_files:[],symbols_covered:[],coverage:'None'},{module:'src/b.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 1);
  assert.equal(r.output.passed, false);
  assert.equal(r.output.uncovered_nodes, 2);
});

test('partial coverage handling', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1},{name:'helper',file:'src/a.ts',depth:2},{name:'bar',file:'src/b.ts',depth:1}]);
  const tc = makeTc([{module:'src/a.ts',test_files:['test/a.test.ts'],symbols_covered:['foo','helper'],coverage:'Partial:1'},{module:'src/b.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 1);
  assert.equal(r.output.covered_nodes, 1);
  assert.equal(r.output.uncovered_nodes, 2);
});

test('threshold 0 flag-only mode', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1}]);
  const tc = makeTc([{module:'src/a.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc, 0);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.passed, true);
});

test('threshold 100 strict mode', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1},{name:'bar',file:'src/b.ts',depth:2}]);
  const tc = makeTc([{module:'src/a.ts',test_files:['test/a.test.ts'],symbols_covered:['foo'],coverage:'Yes'},{module:'src/b.ts',test_files:[],symbols_covered:[],coverage:'None'}]);
  const r = runScript(br, tc, 100);
  assert.equal(r.exitCode, 1);
  assert.equal(r.output.passed, false);
});

test('missing --test-coverage arg → exit 1 and emit error', () => {
  const br = makeBr([{name:'foo',file:'src/a.ts',depth:1}]);
  const brPath = join(TMP, `br-err-${Date.now()}.json`);
  writeFileSync(brPath, JSON.stringify(br), 'utf8');
  try {
    execFileSync(process.execPath, [SCRIPT_PATH, '--blast-radius', brPath], { encoding: 'utf8', timeout: 5000 });
    assert.fail('should have thrown');
  } catch (e) {
    assert.ok(e.status === 1 || e.status === null, `expected 1 or null, got ${e.status}`);
    const stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString('utf8') : (e.stderr || '');
    assert.ok(stderr.includes('Missing') || (e.stdout || '').includes('TIMEOUT'),
      `expected error about missing arg, got stderr: ${stderr}, stdout: ${e.stdout}`);
  } finally {
    try { unlinkSync(brPath); } catch {}
  }
});

test('readJsonFile with non-existent file throws "File not found"', () => {
  const missingPath = join(TMP, `nonexistent-${Date.now()}.json`);
  try {
    execFileSync(process.execPath, [SCRIPT_PATH, '--blast-radius', missingPath, '--test-coverage', missingPath], { encoding: 'utf8', timeout: 5000 });
    assert.fail('should have thrown');
  } catch (e) {
    const stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString('utf8') : (e.stderr || '');
    assert.ok(stderr.includes('File not found:'), `expected "File not found:" in stderr, got: ${stderr}`);
  }
});

test('total_count mismatch logs warning and output includes field', () => {
  const br = { target: 'test', risk_level: 'Low', affected_symbols: [{ name: 'foo', file: 'src/a.ts', depth: 1 }], total_count: 99 };
  const tc = makeTc([{ module: 'src/a.ts', test_files: ['test/a.test.ts'], symbols_covered: ['foo'], coverage: 'Yes' }]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.total_count_reported, 99);
  assert.equal(r.output.blast_radius_total, 1);
  assert.ok(r.stderr.includes('WARNING: total_count mismatch: reported=99, actual=1'), `expected mismatch warning in stderr, got: ${r.stderr}`);
});

test('total_count absent from input — validated and rejected', () => {
  const br = { target: 'test', risk_level: 'Low', affected_symbols: [{ name: 'foo', file: 'src/a.ts', depth: 1 }] };
  const tc = makeTc([{ module: 'src/a.ts', test_files: ['test/a.test.ts'], symbols_covered: ['foo'], coverage: 'Yes' }]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 1);
  assert.ok(r.stderr.includes('total_count'), `expected total_count validation error in stderr, got: ${r.stderr}`);
});

test('empty blast radius with total_count mismatch', () => {
  const br = { target: 'test', risk_level: 'Low', affected_symbols: [], total_count: 3 };
  const tc = makeTc([]);
  const r = runScript(br, tc);
  assert.equal(r.exitCode, 0);
  assert.equal(r.output.passed, true);
  assert.equal(r.output.blast_radius_total, 0);
  assert.equal(r.output.total_count_reported, 3);
  assert.equal(r.output.covered_nodes, 0);
});

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
