# Draft correction: make existing read-only review inputs usable

Observed v1 product trials retained actual source-level reviews but failed canonical consumption because reviewers lacked explicit paths to existing native session metadata or baseline observations, attempted denied Bash effects, emitted the wrong reviewer type, or mistyped a long digest while encoding a receipt. This draft changes no permission, reviewer verdict, subject hash, acceptance or budget. It is not active guidance for the running v1 experiment.

For each independent reviewer, the Primary prepares the exact read-only input paths and the current external receipt schema before launch. Give the reviewer:

- The absolute original baseline/log paths (or byte-identical preserved copies) and exact source/contract/authority refs. A Git worktree does not contain ignored probe files by itself.
- Its actual delegation attempt's `pi-sessions` directory. The reviewer can use native `ls` and `read` to read only the first session-header and model-change records: these expose the real session ID, native provider/model and real review-session start timestamp. No Bash, clock command or invented identity is needed. State when the receipt timestamp denotes that observed session start.
- A JSON specimen made by ordinary local formatting from the current canonical schema and exact observed metadata. `reviewer` is a nonempty string, never an object. The Primary cannot fill in a reviewer verdict or findings. Only the independent reviewer chooses those semantic fields and originates the final receipt.
- A reminder that the current read-only permission permits inspection, not Bash/commands or writing output files. Retained test results must be labelled as inspected. Denied operations stay denied.

The reviewer returns the complete receipt as a raw JSON string in the typed result's evidence array. Raw JSON is already supported; no Base64 requirement exists. The Primary decodes the typed result once, saves that exact evidence string unchanged, computes its SHA and runs the existing external-receipt consumer. Do not normalize, repair, guess or replace reviewer-originated bytes. A subject mismatch or malformed receipt remains a failed observation.

This is an instruction and context-handoff correction using existing files and validators, not a new identity tool, receipt service or semantic engine. Test it in a newly versioned, fixed experiment after all v1 trials settle; retain v1 failures and distinguish the corrected fixture from a product improvement.
