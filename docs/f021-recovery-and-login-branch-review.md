# F021 recovery and login branch review

Reviewed 2026-11-17 against Master Tasklist M02/F021 tasks T025 and T027.

## T025: working-copy inventory

- The original local checkout at `baseline-plus-repo` is present, but Git cannot read its pack file (`pack-eb858dcd35060fb420ac2d1db177def5fce9c510.pack` is truncated). Git status and refs from that checkout are therefore not reliable.
- The recovered checkout is `baseline-plus-repo-recovered`. It is a clean clone on `feature/f023-beta-interview-guide` at `a458486` and tracks the matching remote feature branch. `git fsck --full` passed. Its only change relative to `main` is the feature-branch lifecycle guidance in `AGENTS.md`.
- A temporary clean clone at `/private/tmp/baseline-plus-agent-rules` is also present at `a458486`; it was used to publish the agent-rule update after the original checkout became unusable.
- The local `src/components/MetricCard.module.css` copies in the recovered and original checkouts match the version on remote `main` (`436c66a46db2d1789eacde5e9f8c538ef2ebca16`). No distinct metric-card CSS patch was found. Because the original checkout's Git pack is damaged, this comparison cannot prove whether it once held uncommitted index or worktree state.
- Remote `main` is `a5b9fce`. The F023 branch is `a458486`; it remains separate and is paused pending real testers for F023.

## T027: diverged login branch review

Compared `feat/create-login` with `main` (`a5b9fce`). The login branch is one commit ahead and two commits behind, with merge base `9707c84b16ebe418417f53dee3acbf6d3b72745d`. Its unique commit is `a64ba664efdf4a5716f64f73c34ceb64a17a8bbd` (`feat(auth): enhance AuthForm with local verification link handling and update tests`).

The unique changes fall into two groups:

1. Verification resend behavior in `src/lib/auth.ts`: sending a verification email when an existing unverified account attempts registration, and sending one after a correct-password sign-in attempt for an unverified account. Better Auth 1.7.6 runs the existing-user sign-up hook before returning the duplicate-account response; `sendOnSignIn` sends verification before returning `EMAIL_NOT_VERIFIED`.
2. Development setup copy in `src/app/page.tsx` and `src/components/AuthForm.tsx`: when running locally without `RESEND_API_KEY`, the registration notice says the verification link is printed by the dev server. README already documents that behavior.

Decision: do not merge the diverged branch wholesale. The verification resend behavior belongs with F051/T075, which explicitly covers porting and confirming resend behavior; review it there against current `main`, including rate limiting and email lifecycle tests. The development copy can be considered independently if the current setup guidance needs a visible reminder. No login-branch source code was ported in this review.

## Scope and remaining F021 work

This note records evidence and the T027 port decision. It does not complete T026 (recover or record the old checkout's missing changes) or T028 (finalize and record the canonical repository decision). Keep `feature/f021-recover-work` open while those F021 tasks remain. F023 work remains paused until real tester participation is available.
