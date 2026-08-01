# Evidence-first debugging

Use this procedure for an observed error, failed check, or unexpected behavior. Diagnose
before editing and work backward from the symptom to the earliest state that violates
the accepted contract.

1. Capture the complete symptom and reproduce it with the smallest exact command or
   action. A different checkout or nearby passing test is not reproduction.
2. Inspect the relevant diff, configuration, dependency, caller, side effect, and
   runtime boundary.
3. Form one falsifiable root-cause hypothesis and choose the smallest observation that
   distinguishes it from alternatives.
4. Test the hypothesis without broad refactoring. Record evidence that accepts or
   rejects it in the active task context `## Change Log`.
5. Write the failing regression on the public seam, then apply the smallest root-cause
   repair through `ultra-tdd`.
6. Rerun the exact reproduction and affected verification. Record residual uncertainty
   and the recovery path in task evidence.

After three distinct repair attempts reveal different underlying failures, stop
patching. Treat the shared boundary as the next diagnostic target and report the
evidence; do not disguise architectural uncertainty with another local fix.
