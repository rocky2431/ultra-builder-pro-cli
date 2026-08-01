# Test lens

Map each changed behavior and acceptance claim to executable evidence. Check the
functional, persistence, protocol, UI and failure boundaries material to this diff.
Inspect doubles for contract fidelity: report one only when it bypasses the behavior
under review or diverges from production semantics.

Find missing state transitions, ineffective assertions, hidden skips, flaky
assumptions and tests that never reach changed code. Calibrate severity to escaped
product risk. Use `axis: engineering_standards` and the shared findings schema.

The worker is read-only. Its only write is the assigned JSON artifact.
