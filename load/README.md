# Load Testing

k6-based load testing suite for the Memtrace Middleware dispatch pipeline.

## Prerequisites

Install k6:
```bash
npm install -g k6
# OR: https://k6.io/docs/get-started/installation/
```

## Test Scripts

| Script | Purpose |
|--------|---------|
| `concurrent-dispatches.js` | Latency validation: p95 < 900ms, p50 < 300ms at 60 RPS |
| `degradation-scenarios.js` | Degradation + recovery simulation under Memtrace failure |
| `ring-buffer-stress.js` | Ring buffer stress test at 100k RPS |

## Quickstart

1. Build the middleware + test server:
```bash
pnpm build
```

2. Start the test server (separate terminal):
```bash
MEMTRACE_TEST_MODE=1 node dist/test-server.js
```

3. Run load tests (separate terminal):
```bash
pnpm test:load:latency
pnpm test:load:degradation
pnpm test:load:ring-buffer
pnpm test:load  # all three
```

## Test Runner Scripts

Windows:
```powershell
.\load\run-tests.ps1
```

Unix:
```bash
chmod +x load/run-tests.sh
./load/run-tests.sh
```

## Configuration

| Env Var | Default | Description |
|---------|---------|-------------|
| `MEMTRACE_TEST_MODE` | — | Must be `1` to start test server |
| `MEMTRACE_TEST_PORT` | `3000` | Test server HTTP port |
| `BASE_URL` | `http://localhost:3000` | k6 target URL |

## Test Server Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/dispatch` | Execute a dispatch with `{tool_call, args}` |
| `POST` | `/simulate/memtrace-down` | Disconnect Memtrace transport |
| `POST` | `/simulate/memtrace-up` | Reconnect Memtrace transport |
| `GET` | `/status` | Current degradation tier + latency stats |

## Output

Results are written to `load/results/` as structured JSON reports:
- `concurrent-dispatches.json` — p50/p95/p99 latencies, cold vs steady-state
- `degradation-scenarios.json` — tier transition timeline, recovery time
