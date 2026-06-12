import { createInterface } from 'node:readline';

const FAIL = process.env.MEMTRACE_MOCK_FAIL === 'true';
const BAD_JSON = process.env.MEMTRACE_MOCK_BAD_JSON === 'true';
const DEADLINE_MS = parseInt(process.env.MEMTRACE_MOCK_DEADLINE_MS || '0', 10);

const rl = createInterface({ input: process.stdin });

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function getImpactResult(target) {
  if (target === 'delay-test') {
    return { risk: 'High', affected_symbols: [], affected_files: [], total_affected: 0 };
  }
  return {
    risk: 'Medium',
    affected_symbols: [
      { name: `${target}_caller1`, file: 'src/caller1.ts', depth: 1 },
      { name: `${target}_caller2`, file: 'src/caller2.ts', depth: 2 },
      { name: `${target}_callee1`, file: 'src/callee1.ts', depth: 1 },
    ],
    affected_files: ['src/caller1.ts', 'src/caller2.ts', 'src/callee1.ts'],
    total_affected: 3,
  };
}

function getDeadCodeResult() {
  return {
    symbols: [
      { name: 'unusedFunc', kind: 'Function', file: 'src/old.ts', line: 10 },
      { name: 'deadClass', kind: 'Class', file: 'src/legacy.ts', line: 42 },
    ],
  };
}

function getListReposResult() {
  return {
    repos: [
      {
        repo_id: 'Repos',
        last_indexed_at: new Date().toISOString(),
        total_nodes: 500,
        nodes: 500,
      },
      {
        repo_id: 'old-project',
        last_indexed_at: new Date(Date.now() - 3600000).toISOString(),
        total_nodes: 100,
        nodes: 100,
      },
    ],
  };
}

rl.on('line', (line) => {
  if (!line.trim()) return;

  if (DEADLINE_MS > 0) {
    const start = Date.now();
    while (Date.now() - start < DEADLINE_MS) {}
  }

  if (BAD_JSON && !badJsonDone) {
    send({ jsonrpc: '2.0', id: null, res: 'broken' });
    badJsonDone = true;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'memtrace-mock', version: '1.0.0' },
      },
    });
  } else if (message.method === 'notifications/initialized') {
    // No response needed
  } else if (message.method === 'tools/call') {
    if (FAIL) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32603, message: 'Simulated failure' },
      });
      return;
    }

    const toolName = message.params?.name;
    let result;

    if (toolName === 'list_indexed_repositories') {
      result = getListReposResult();
    } else if (toolName === 'get_impact') {
      const target = message.params?.arguments?.target || 'unknown';
      result = getImpactResult(target);
    } else if (toolName === 'find_dead_code') {
      result = getDeadCodeResult();
    } else {
      result = {};
    }

    send({
      jsonrpc: '2.0',
      id: message.id,
      result,
    });
  } else if (message.method === 'shutdown') {
    send({ jsonrpc: '2.0', id: message.id, result: {} });
  } else {
    send({ jsonrpc: '2.0', id: message.id, result: {} });
  }
});

let badJsonDone = false;

rl.on('close', () => {
  process.exit(0);
});
