# Stage A review observation: ZCode drops an advisory reminder

Subject: baseline `2e3273bf12f6493b3201fad3d9d1b802ae367a4f`; recheck against the returned candidate before treating this as an open finding.

`adapters/zcode.js::buildHooksManifest` registers `mid_workflow_recall.py` for PreToolUse Write/Edit/ApplyPatch/Grep. Shared recall emits only an additionalContext. `hooks/adapters/zcode.py::adapt_output` returns `{}` for that response because it only retains PreToolUse context when a permission decision is present. Direct execution of the actual baseline adapter reproduced the empty projection.

This is not a demonstrated Host limitation. Live official documentation at https://zcode.z.ai/en/docs/hooks describes context injection independently of permission decisions. More decisively, the actual App-bundled ZCode 0.16.5 runtime (`zcode.cjs`, SHA-256 `e9f1868c0fdb863537ed910ee3828b9be96b8c2fd805473f63b439e1113266b8`) declares both PreToolUse additionalContext and permissionDecision optional (bundle character offset 764503), and its actual `Oni` hook consumer (offset 10470670) pushes additionalContext without requiring a permission decision. Extracting and executing that native consumer with a context-only response retained the reminder and did not create permissionBehavior.

Required outcome if still present in the candidate: preserve supported advisory PreToolUse context through the registered ZCode adapter without inventing allow/ask/deny. Add a focused adapter-path regression that a real shared reminder survives projection, remains advisory, and repeated-reminder suppression does not hide the first Host-visible output. This is within Stage A's actual Hook-consumer requirement, not permission to modify Host installations or other delegation code.

Evidence classes: direct shared-adapter execution and exact installed Host source/consumer execution; neither alone claims a full live model lifecycle smoke. The final journey report must retain that distinction.

## Additional candidate observation: return to an earlier acceptance is hidden

The in-progress candidate hook SHA-256 `306761bf8d42c54be287c7aad130ef34a7319eed1028dafc6cd9dfb77976b0ac` records a history of delivered keys and suppresses any key found in that history. Using the candidate's existing `typed_project` and `recall` helpers in a temporary fixture, Codex exercised one identified session with acceptance A, changed acceptance B, then restored acceptance A. Actual subprocess observations were: A visible (543 output bytes), B visible (547 bytes), restored A silent (0 bytes), all exit 0.

This fails the promised changed-acceptance behavior on a normal reversal: the current reminder differs from the most recent one, but is mistaken for an unchanged repeat because it appeared earlier. The same cache shape should also be checked for task A -> B -> A. Suppress only unchanged current context for the relevant Host/session/agent view; do not treat historical delivery as permanent visibility. Prefer a smaller current-delivery record over a catalogue of every visited acceptance if it meets the actual consumer.

These observations are preliminary while ZCode is still writing. Reproduce against the frozen returned candidate, combine related root causes, and issue one bounded initial Review rather than counting each observation as a separate Review cycle.

## Evaluation protocol must be executable before the stage commit

The new evaluation document currently schedules actual-provider runs only after Codex accepts and commits the stage, while the accepted plan requires actual journey evidence to decide that acceptance. Freeze a candidate with a base revision plus exact content hashes/manifest before evaluation; a stage commit follows acceptance, not the reverse.

The JSON also aborts on any credential use, external spend or real-HOME write. That would reject every ordinary configured provider run (authentication, metered entitlement use, normal session/receipt caches), although the Owner already authorized these Agent calls. Keep the actual exclusions: no purchases/top-ups, identity or credential mutation, credential disclosure, real-HOME configuration/installation changes, or production effects. Use isolated project and plugin/config test surfaces where supported, document normal runtime writes, and do not call a path isolated merely because cwd points to /tmp. Do not invent a new login or installation to make the evaluation work.

An actual-provider run can use scripted Owner inputs; these are separate measurement dimensions, not mutually exclusive evidence classes. Record both truthfully and keep live human observations and active-time measurements unknown until actually observed. Also preserve the difference between a machine tool request and a user-visible question. Recheck this new protocol after the candidate stops changing.
