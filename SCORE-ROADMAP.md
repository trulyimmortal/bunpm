# bunpm quality roadmap and handoff

Updated: 2026-10-16. Starting revision: `d9c10ee` (2.3.1).
Scope: Architecture & Robustness, Security Hygiene, Dependency Health.
Ponytail: fix demonstrated behavior with the smallest complete change and test.

## Baseline and interpretation

Latest user-supplied DataFactor report: **82 / B**.

| Dimension                 | Reported score |
| ------------------------- | -------------: |
| Architecture & Robustness |             78 |
| Security Hygiene          |             82 |
| Dependency Health         |             72 |
| Test Coverage             |             88 |
| Docs & Onboarding         |             90 |
| Code Cleanliness          |             88 |
| History & Maintenance     |             68 |
| CI/CD Maturity            |             85 |

These are external report observations, not measurements produced by this work.
No improvement in score is guaranteed. Do not rescan until implementation and
verification finish; the user explicitly deferred the next scan.

The report misses runnable native `node:test` suites and CI checks, misclassifies
this CLI as a backend, and fails to recognize the tracked `bun.lock`. Preserve
working tooling; do not add a framework, fake configuration, or infrastructure
solely to satisfy those detections. Both lockfiles are already tracked.

## Implementation order

Each checkbox represents a complete behavior change with regression tests, not
an instruction to commit each edited line. Complete validation before committing.

#### 1. Windows installer ownership during rollback

- [x] Fix `bunpm/platforms/windows/scripts/install.ps1` so a failed directory
      creation cannot delete a directory created by another installer. (Delivered in `e8162e5`)
- Evidence: the initial existence check precedes prerequisite checks; `New-Item`
  is inside a catch block that recursively deletes any existing target.
- Minimal approach: create the target before entering the rollback-protected
  copy phase. Only the invocation that created the directory owns cleanup.
- Regression: create an installation sentinel during a prerequisite probe;
  installation must fail without removing it. Separately force a copy failure
  after successful creation and verify owned partial files are removed.
- Acceptance: native Windows installer/smoke tests pass without registry changes.

### 2. Unix installer profile read failures

- [ ] Fix Linux and macOS `install.sh` profile-marker checks.
- Evidence: `! grep` treats exit 2 (read failure) as exit 1 (marker absent), so
  installation may append a marker and report success after a read failure.
- Distinguish match, absent marker, and read error. On read error preserve the
  profile, fail installation, and roll back files owned by this invocation.
- Regression: a controlled grep failure leaves profile bytes unchanged and
  removes the partial installation; existing success/idempotence tests remain.
- Acceptance: ShellCheck, Bash syntax, and native Linux/macOS installer CI pass.

### 3. Child output stream failures

- [x] Handle stdout/stderr read errors in `bunpm/core/wrapper.js`. (Delivered in `78d23b0`)
- Evidence: child process errors are handled, but stream error events can escape
  the async entry point. A child that subsequently exits zero can mask lost output.
- Record the failure, retain a nonzero result, and clean up listeners. Do not
  retry an already-started command through another manager.
- Regression: each stream emits an error followed by child close zero; assert
  failure, useful diagnostics, no duplicate spawn, and signal-listener cleanup.

### 4. Lossless npm restart fallback

- [ ] Verify npm's documented restart semantics and route unsafe mappings native.
- Evidence to verify against official npm docs: without a restart script, npm
  restart runs stop/start behavior that `bun run restart` cannot reproduce.
- Keep explicit `npm run restart` translation intact. Inspect PNPM's reuse of
  npm tables before changing a shared entry.
- Regression: native restart receives exact arguments without Bun discovery;
  explicit script invocation still maps normally.

### 5. Bound formatter buffering for long lines

- [ ] Bound `formatter.js` pending-line memory without truncating output.
- Evidence: a 6.25 MiB newline-free stream currently emits nothing before EOF,
  even when the destination is fast.
- Small approach: bypass cosmetics for an oversized line, stream it unchanged,
  and resume normal formatting after its newline.
- Regression: output arrives before EOF; concatenated text is preserved; split
  UTF-8, EOF without newline, and the next normal formatted line all work.

### 6. Honest dependency health evidence & lockfile detection

- [ ] Review the freshness-report CI step, distinguishing exit 1 from fatal errors.
- [ ] Add explicit CI step assertion ensuring `bun.lock` is committed before install.
- [ ] Close the `RELEASE_TAG` env gap in `.env.example`.
- [ ] Add `testConfig` metadata to `package.json` and create `tests/README.md`.
- Refresh both locks together for dependency changes. Preserve exact dev pins,
  Node 16 type definitions, and zero runtime dependencies.

### 7. Correct documentation, PR authorship and release

- [ ] Correct ARCHITECTURE trust-boundary references.
- [ ] Prepare small scoped PRs from `trulyimmortal` for commit diversity.
- [ ] Recheck full verification sequence and prepare v2.3.2 release.

## Verification and delivery

Follow CONTRIBUTING.md. Invoke Node tests directly to avoid the stale local
bunpm installation intercepting npm. Use the Node-managed npm CLI when needed.

Before each coherent commit: syntax, strict ESLint, TypeScript, Prettier, audit,
native tests, c8 coverage, repeat tests, installer/smoke checks, and diff checks.
For shell/workflow changes also run ShellCheck, Bash syntax and actionlint.
Preserve baseline coverage; investigate any regression rather than lowering gates.
Run the full three-OS GitHub matrix before calling a platform fix verified.

Keep all source and test files strictly under 275 LOC. No source file over 500 LOC.
Use one real fix plus regression tests per Conventional Commit, with validation
in the commit body. Main changes use yv3000. Small real issues may use the
authorized trulyimmortal PR workflow. Both accounts belong to the same person:
disclose that fact and never present self-review as independent review.

No Docker, infrastructure, services, runtime packages, or new test framework.
No C: writes. Scratch, fixtures and caches belong under the user-approved X:
testing directory and must be cleaned after use.

## Continuation checkpoint

- Roadmap synchronized at revision `78d23b0` on `main`.
- Item 1 (`e8162e5`) and Item 3 (`78d23b0`) delivered and verified on native CI.
- Item 2 Unix profile fix staged in `bunpm/platforms/{linux,macos}/scripts/install.sh` and `tests/installer.test.js`.
- Item 5 long-line buffering regression test written in `tests/formatter.test.js`.
- Next actions: implement Item 5 buffering in `formatter.js`, commit Item 2 & 5 with tests, address Item 4 & 6.
