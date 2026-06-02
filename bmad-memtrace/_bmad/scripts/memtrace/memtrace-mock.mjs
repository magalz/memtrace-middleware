import { createInterface } from 'node:readline';
import { fixtures } from './memtrace-fixtures.mjs';

const DEBUG = process.env.MEMTRACE_DEBUG === '1';

function log(phase, event, extra) {
  if (!DEBUG) return;
  const parts = [`[MemtraceMock] ${phase} ${event}`];
  if (extra !== undefined) parts.push(String(extra));
  console.error(parts.join(' '));
}

const TOOL_SCHEMAS = [
  {
    name: 'find_code',
    description: 'Find code using hybrid BM25+vector search',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  },
  {
    name: 'get_impact',
    description: 'Compute blast radius of changing a symbol',
    inputSchema: {
      type: 'object',
      properties: { target: { type: 'string' }, repo_id: { type: 'string' } },
    },
  },
  {
    name: 'get_symbol_context',
    description: 'Get 360-degree view of a symbol',
    inputSchema: {
      type: 'object',
      properties: { symbol: { type: 'string' }, repo_id: { type: 'string' } },
    },
  },
  {
    name: 'find_dead_code',
    description: 'Find dead code candidates',
    inputSchema: {
      type: 'object',
      properties: { repo_id: { type: 'string' }, file_path: { type: 'string' } },
    },
  },
  {
    name: 'list_indexed_repositories',
    description: 'List all indexed repositories',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'memtrace_check_freshness',
    description: 'Check index freshness',
    inputSchema: { type: 'object', properties: { repo_id: { type: 'string' } } },
  },
];

function sendResponse(id, result) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(response + '\n');
  log(`request:${id}`, 'ok');
}

function sendError(id, code, message) {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(response + '\n');
  log(`request:${id}`, 'error', message);
}

function sendNotification(method, params) {
  const notification = JSON.stringify({ jsonrpc: '2.0', method, params });
  process.stdout.write(notification + '\n');
}

function extractMagicParams(rawArgs) {
  const args = typeof rawArgs === 'object' && rawArgs !== null ? { ...rawArgs } : {};

  const envFail = process.env.MEMTRACE_MOCK_FAIL === 'true';
  const envDeadline = process.env.MEMTRACE_MOCK_DEADLINE_MS
    ? parseInt(process.env.MEMTRACE_MOCK_DEADLINE_MS, 10)
    : null;
  const envBadJson = process.env.MEMTRACE_MOCK_BAD_JSON === 'true';

  const magic = {
    fail: args.memtrace_fail === true || envFail,
    deadline: typeof args.memtrace_deadline === 'number' ? args.memtrace_deadline : envDeadline,
    badJson: args.memtrace_bad_json === true || envBadJson,
  };
  delete args.memtrace_fail;
  delete args.memtrace_deadline;
  delete args.memtrace_bad_json;
  return { magic, args };
}

function handleToolCall(name, rawArgs, id) {
  const { magic, args } = extractMagicParams(rawArgs);

  let result;
  switch (name) {
    case 'find_code':
      result = fixtures.find_code(args.query);
      break;
    case 'get_impact':
      result = fixtures.get_impact(args.target);
      break;
    case 'get_symbol_context':
      result = fixtures.get_symbol_context(args.symbol);
      break;
    case 'find_dead_code':
      result = fixtures.find_dead_code(args.file_path || args.target);
      break;
    case 'list_indexed_repositories':
      result = fixtures.list_repos();
      break;
    case 'memtrace_check_freshness':
      result = fixtures.memtrace_check_freshness();
      break;
    default:
      sendError(id, -32601, 'Method not found');
      return;
  }

  const emit = () => {
    if (magic.fail) {
      sendError(id, -32000, 'Simulated failure');
      return;
    }
    if (magic.badJson) {
      process.stdout.write('{"jsonrpc": "2.0", "id":' + '\n');
    }
    sendResponse(id, result);
  };

  if (magic.deadline !== null) {
    setTimeout(emit, magic.deadline);
  } else {
    emit();
  }
}

log('init', 'start');

let shutdownReceived = false;
let initialized = false;

const rl = createInterface({ input: process.stdin });

rl.on('line', (line) => {
  if (!line.trim()) return;
  if (shutdownReceived) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      }) + '\n'
    );
    return;
  }

  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      if (initialized) {
        sendError(id, -32600, 'Already initialized');
        break;
      }
      log('handshake', 'start');
      sendResponse(id, {
        capabilities: { tools: {} },
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'memtrace-mock', version: '1.0.0' },
      });
      sendNotification('notifications/initialized', {});
      initialized = true;
      log('handshake', 'ok');
      break;

    case 'notifications/initialized':
      break;

    case 'tools/list':
      sendResponse(id, { tools: TOOL_SCHEMAS });
      break;

    case 'tools/call':
      handleToolCall(params.name, params.arguments || {}, id);
      break;

    case 'shutdown':
      log('shutdown', 'start');
      sendNotification('notifications/exited', {});
      sendResponse(id, {});
      log('shutdown', 'ok');
      shutdownReceived = true;
      rl.close();
      break;

    default:
      sendError(id, -32601, 'Method not found');
  }
});

rl.on('close', () => {
  log('shutdown', 'exit');
  setTimeout(() => {
    process.exit(0);
  }, 100);
});

process.on('SIGTERM', () => {
  process.exit(0);
});
process.on('SIGINT', () => {
  process.exit(0);
});
