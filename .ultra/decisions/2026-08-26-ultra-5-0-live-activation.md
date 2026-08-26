# Decision: Activate and release the Ultra Builder Pro 5.0 live ACP path

> **Status**: accepted
> **Decision identity**: `2026-08-26-ultra-5-0-live-activation`
> **Acceptance time**: `2026-08-26` (conversation date; no finer owner-authored time was supplied)

## Question

Should the accepted 5.0 Change stop at the verified local candidate, or finish the
remaining live Host, user-installation, Windows, and public-release boundaries now?

## Accepted decision

Finish the remaining boundaries inside `chg-ultra-5-0`. The Owner explicitly requested:

> 现在完成接下来需要完成的全部部分 ZCode 专用 ACP bridge 尚未真正接通。
> 六个 Host 都还没有通过真实 ACP conformance，因此当前全部选择 CLI fallback。
> 没有真实 provider 调用和真实用户目录安装。没有 Windows 子进程清理验证。
> 没有 commit、push、tag、publish 或部署。都需要完成的

This grants the following separate effects:

- build the Apache-2.0 `jpalmae/zcode-acp` v0.1.0 source at commit
  `42fe149d4b501469343c01f23ba3801832306d53`, apply the digest-bound
  ZCode 0.16.5 runtime-preferences compatibility patch after a reproduced failure,
  run the locked tests, and install only the resulting bridge binary under the current
  user's executable path;
- run one bounded, read-only, no-write conformance task through each of Claude Code,
  Codex, OpenCode, Kimi Code, Grok Build, and ZCode using existing local authentication;
- install this repository's 5.0 package into the six real user Host directories, keep
  the verified installation active, and retain an ownership-safe uninstall/reinstall
  recovery path;
- commit and push the authorized 5.0 scope to `origin/main`, run the real GitHub Actions
  matrix including `windows-latest`, and use that runner for descendant cleanup proof;
- after the pushed release commit is green, create `v5.0.0`, publish
  `ultra-builder-pro-cli@5.0.0` through the repository's npm trusted-publishing workflow,
  and create/verify the matching GitHub Release.

## Bounded interpretation

- Provider calls use the smallest prompt that proves ACP v1 negotiation, session
  creation, streamed output, exact Ultra result handoff, clean Git state, and terminal
  cleanup. They may consume the Owner's existing subscription quota, but must not buy
  credits, start a paid plan, or retry unboundedly.
- Existing authentication may be consumed but credential values are never read into,
  printed by, or retained in repository evidence. A required interactive login is a
  reachable user action, not permission to extract or replace credentials.
- For ZCode, the Host is ZCode Desktop while the provider/account is the Owner's domestic
  智谱 BigModel Coding Plan. The headless config may mechanically reuse that existing
  same-product provider entry without exposing its opaque credential value; international
  Z.AI OAuth is not the accepted provider path.
- `zcode-acp` remains an independently installed optional bridge. Ultra neither copies
  nor redistributes `zcode.cjs`; it resolves the installed ZCode Desktop runtime. Ultra
  may ship the small source patch required to reproduce compatibility with that runtime,
  but does not redistribute the bridge binary.
- This repository has no deployable service or infrastructure target. Its real delivery
  surfaces are npm and GitHub Release; no unrelated hosting deployment is invented.
- Publication is append-only in practice: rollback is a new reverting release and npm
  deprecation where appropriate, never force-push or npm unpublish.

## Recovery

- Local 5.0 candidate recovery commit: `8be6f6d`.
- User installation rollback: the adapters' ownership-safe uninstall followed by the
  previously installed package version if needed; unrelated Host files remain untouched.
- Source rollback after push: a normal revert commit on `main`.
- Failed pre-release remote validation: do not create the tag.
- Failed publication after the immutable version exists: preserve evidence, repair in a
  new version, and deprecate the broken npm version if necessary.

## Exclusions retained

Team Pack, remote shared assets, credential export, provider purchase/top-up, force-push,
npm unpublish, a resident daemon, semantic route authority, and any service deployment
not already present in this repository remain outside the grant.

## Amendment: domestic BigModel and ZCode 0.16.5

The Owner corrected the provider boundary during execution: “我是国内的智普啊 不是zcode啊”.
Inspection then verified that ZCode Desktop already contained an
enabled `builtin:bigmodel-coding-plan` provider at
`https://open.bigmodel.cn/api/anthropic`. Direct headless provider smoke returned exact
`PONG` after the same-product provider was made visible to the CLI config.

The provider fix exposed a separate transport drift: ZCode CLI 0.16.5 sends
`session/requestRuntimePreferences` before completing `session/create`, while upstream
`zcode-acp` v0.1.0 was verified only against CLI 0.15.2 and ignored the request. The
failure was reproduced in the fake E2E before applying the source patch retained at
`skills/ultra-delegate/patches/zcode-acp-0.1.0-zcode-0.16.5.patch`. This amendment
clarifies the already accepted outcome; it does not authorize a new provider purchase,
credential export, bridge binary redistribution, or service deployment.
