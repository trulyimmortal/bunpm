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

### 1. Windows installer ownership during rollback

- [ ] Fix `bunpm/platforms/windows/scripts/install.ps1` so a failed directory
      creation cannot delete a directory created by another installer.
- Evidence: the initial existence check precedes prerequisite checks; `New-Item`
  is inside a catch block that recursively deletes any existing target.
- Minimal approach: create the target before entering the rollback-protected
  copy phase. Only the invocation that created the directory owns cleanup.
- Regression: create an installation sentinel during a prerequisite probe;
  installation must fail without removing it. Separately force a copy failure
  after successful creation and verify owned partial files are removed.
- Acceptance: native Windows installer/smoke tests pass without registry changes.
- Expected benefit: prevent destructive race; architecture and security evidence.

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

- [ ] Handle stdout/stderr read errors in `bunpm/core/wrapper.js`.
- Evidence: child process errors are handled, but stream error events can escape
  the async entry point. A child that subsequently exits zero can mask lost output.
- Record the failure, retain a nonzero result, and clean up listeners. Do not
  retry an already-started command through another manager.
- Regression: each stream emits an error followed by child close zero; assert
  failure, useful diagnostics, no duplicate spawn, and signal-listener cleanup.
- Review lifecycle carefully: do not introduce a promise that never settles.

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
- Keep slow-destination backpressure separate. Investigate it after this fix;
  avoid adding one drain listener per output line or a new stream abstraction.

### 6. Honest dependency health evidence

- [ ] Review the freshness-report CI step, which currently uses `|| true`.
- Distinguish a valid outdated-package result from registry/network failure.
  Freshness remains advisory; unavailable data must not look like a clean scan.
- Check official npm exit/output behavior before choosing a minimal script or
  workflow change; cover classification of empty, outdated, and error results.
- [ ] Recheck both audits against registries and review actual advisories.
      Update dependencies only for demonstrated security/compatibility benefit.
- Refresh both locks together for dependency changes. Preserve exact dev pins,
  Node 16 type definitions, and zero runtime dependencies.
- Do not downgrade or upgrade packages merely to influence judge wording.

### 7. Correct documentation and final verification

- [ ] Correct ARCHITECTURE trust-boundary references: bootstrap deliberately
      duplicates validation because downloaded installers must be standalone.
- [ ] Describe HTTPS and commit-pinned URLs accurately: they do not provide
      independent content-hash or signature verification.
- [ ] Reconcile the diagnostics schema in CONTRIBUTING with actual logger tests.
- [ ] Document `RELEASE_TAG` as a release-check input, not required CLI setup.
- [ ] Record actual test/coverage results, CI links, and remaining platform limits.
- [ ] Prepare scanner evidence from real commands/artifacts; never claim a
      detection issue is fixed without a new report.

## Verification and delivery

Follow CONTRIBUTING.md. Invoke Node tests directly to avoid the stale local
bunpm installation intercepting npm. Use the Node-managed npm CLI when needed.

Before each coherent commit: syntax, strict ESLint, TypeScript, Prettier, audit,
native tests, c8 coverage, repeat tests, installer/smoke checks, and diff checks.
For shell/workflow changes also run ShellCheck, Bash syntax and actionlint.
Preserve baseline coverage; investigate any regression rather than lowering gates.
Run the full three-OS GitHub matrix before calling a platform fix verified.

Keep source/test files around 200-300 lines; do not split cohesive tests only to
hit 275. No source file may grow past 500 lines. Do not treat generated lockfile
size as a reason to remove reproducibility metadata.

Use one real fix plus regression tests per Conventional Commit, with validation
in the commit body. Main changes use yv3000. Small real issues may use the
authorized trulyimmortal PR workflow. Both accounts belong to the same person:
disclose that fact and never present self-review as independent review.
Keep required checks and restore any authorized temporary ruleset bypass in a
finally path. Do not rewrite history or force-push.

No Docker, infrastructure, services, runtime packages, or new test framework.
No C: writes. Scratch, fixtures and caches belong under the user-approved X:
testing directory and must be cleaned after use. Do not commit credentials,
email addresses supplied for DataFactor, local tool caches, or generated reports.

## Continuation checkpoint

- Roadmap saved before implementation of this round.
- Starting tree was clean on main, synchronized with origin/main at `d9c10ee`.
- Runtime and installer read-only audits are complete; the tasks above capture
  their actionable findings. No runtime changes from this round are committed yet.
- Previous round's scratch directory is absent; its earlier cleanup blockage is
  no longer an outstanding filesystem task.
- Last recorded 2.3.1 verification in AGENTS.md is historical, not a fresh run.
  Re-run checks before relying on those numbers for new changes.
- Update these checkboxes and this checkpoint after each delivered fix. Record
  exact commits/PRs, verification failures, and pending CI for the next agent.
