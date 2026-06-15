# Contributing

## Setup

```bash
pnpm install
```

## Test Commands

| Command                              | Description               |
| ------------------------------------ | ------------------------- |
| `pnpm test`                          | Unit + integration tests  |
| `pnpm test -- --run tests/contract/` | Contract canary tests     |
| `pnpm test:load:ring-buffer`         | k6 ring buffer stress     |
| `pnpm test:load:latency`             | k6 latency validation     |
| `pnpm test:load:degradation`         | k6 degradation simulation |
| `pnpm test:load`                     | All k6 load tests         |

## Lint & Build

```bash
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
pnpm build      # tsup ESM+CJS+DTS
```

## PR Checklist

- [ ] Files follow kebab-case naming (`my-file.ts`)
- [ ] Types are PascalCase (no I-prefix)
- [ ] Functions are camelCase
- [ ] No `console.log` — use `createLogger()`
- [ ] No `Promise.all` — use `Promise.allSettled`
- [ ] No `.then()` / `.catch()` — use `async/await`
- [ ] Zod schemas at input boundaries
- [ ] Barrel exports in `src/index.ts`

## Branch Naming

- `feat/` — new features
- `fix/` — bug fixes
- `chore/` — maintenance

## Commit Style

Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`
