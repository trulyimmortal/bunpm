# bunpm Test Suite

Native test runner and coverage configuration for bunpm.

## Runner & Architecture

- **Runner**: Node.js built-in `node:test` (`npm test` -> `node --test "tests/*.test.js"`).
- **Assertions**: Node.js built-in `node:assert/strict`.
- **Zero Test Dependencies**: Uses Node's standard library test runner directly; no runtime or external framework required.
- **Coverage**: [c8](https://github.com/bcoe/c8) configured via [`.c8rc.json`](../.c8rc.json) enforcing 95% statements, 90% branches, 90% functions, and 90% lines.
- **Type Checking**: TypeScript strict `checkJs` via [`jsconfig.json`](../jsconfig.json) against `@types/node` 16.

## Test Suites

1. `tests/core.test.js`: Core mapper units, flag translations, POSIX exit codes, and child pipe error handling.
2. `tests/mapper.test.js`: Command mapping tables, flags, aliases, and native fallbacks across npm, yarn, and pnpm.
3. `tests/wrapper.test.js`: Binary resolution, wrapper entry, execution routing, and error diagnostics.
4. `tests/main.test.js`: Streamed execution, signal forwarding (SIGINT/SIGTERM), and fallback lifecycle.
5. `tests/formatter.test.js`: Output line styling, bounded buffer streaming for oversized lines, and property tests.
6. `tests/validation.test.js`: Trust-boundary input validation schemas and fail-closed security guards.
7. `tests/log.test.js`: Multi-level diagnostic logging and structured JSON schema (`BUNPM_DEBUG=1`).
8. `tests/doctor.test.js`: Diagnostic health checks (`bunpm doctor`) and environment validation.
9. `tests/bootstrap.test.js`: Standalone remote installer transport, redirect security, and integrity verification.
10. `tests/installer.test.js`: Platform installer PATH configuration, rollback ownership, and prerequisite failures.
11. `tests/uninstall.test.js`: Shell profile marker removal and idempotent profile cleanup.
12. `tests/toolchain.test.js`: Node/Bun version pins, bin scripts, and CI workflow invariants.
13. `tests/smoke.test.js`: End-to-end native installation, execution, launcher, and uninstall lifecycle.

## Commands

```sh
npm test                      # Run all 13 test suites offline
npm run test:coverage         # Run test suites with c8 coverage enforcement
npm run test:repeat           # Run 3 consecutive test iterations (with random seeds on Node 26+)
npm run typecheck             # Validate strict types against jsconfig.json
npm run lint                  # Verify 0 ESLint warnings
npm run format:check          # Verify Prettier compliance
```
