# D1 Repair 2 timeout continuation grant

> **Change**: `chg-ultra-vnext-d1-delegation-safety`
>
> **Task**: `vnext-d1-runtime-safety-boundary`
>
> **Owner instruction**: 「接受啊 任何意外都不要停止任务」
>
> **Recorded at**: `2026-09-01T20:42:14+08:00`

## Exact authorization

The Owner accepts the requested single bounded
`repair-2-timeout-continuation` ZCode attempt. It may finish only the existing Repair 2
partial diff on the same ten implementation/test paths. ZCode remains the sole
implementation-code writer; Codex remains reviewer and evidence writer.

The continuation has a cumulative maximum of 7200 active provider seconds. Recoverable
tool, test, process, or transport accidents do not terminate the goal: Codex may clean
up an exactly owned local test process and resume the same logical continuation using
only its unused cumulative time, with no overlapping writer. This is not authority for
another design repair, a second cumulative budget, automatic fallback to another Host,
purchase, or top-up.

The continuation must preserve the frozen authority and current partial bytes, keep all
outside-scope dirty files byte-identical, and return a Task Review candidate rather than
self-approve.

## Effects still excluded

This grant does not authorize commit, push, tag, publish, deploy, real-HOME
installation, credentials or identity changes, production/business access, package
fetches, or any other external effect. An authority mismatch, an unlisted required path,
or a requirement for one of those effects remains a hard stop; the Owner's persistence
instruction does not convert capability into authority.
