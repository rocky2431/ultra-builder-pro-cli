# Independent blind factual adjudication — QA only

The owner says: "接下来不用交给claude实现了 全部你自己来独立完成" and "实现是你来实现，你不要给到任何人去实现，就是代码和整个实现这块是由你来完成。验证你可以做。你验证的时候，如果需要委派给其他的 QA，你委派过去也可以。"

You are independent read-only QA, not an implementation author. Do not write files, code, scripts or tests, run shell commands, access providers or credentials, or spawn agents. Use only the supplied native read tool. Return declarative judgments in your final response. No changes are authorized to the cases, expected facts, original responses, scores or candidate.

Read only `work/trellis-eight-step-20260909/stage-e8-blind-responses.json`. It contains four original task missions and their JSON data, plus 24 final native responses with randomized opaque response IDs and randomized order. Treatment names, costs and automatic scores are withheld. Do not search for the treatment mapping, candidate, evaluation runner or other outputs. Review against each original mission and data; do not guess a preferred treatment.

For every response, independently derive the facts and judge whether its summary/evidence completes the requested factual audit or reconciliation. Check the whole requested task, including any material factual error outside a short expected-fact list. Treat identity lists, counts, formatting and incomplete answers according to what the mission actually requires. If a mission admits more than one reasonable interpretation, say so and identify the alternatives; do not invent a stricter requirement after seeing the answer. Distinguish a wrong fact from an ambiguous evaluator expectation or an incomplete response.

This is only semantic fact checking. Runtime permission denials, malformed outer typed results, writer identity and transport completion are assessed separately from immutable native receipts. A factually correct response cannot waive a denied effect, become an accepted product result, or promote a strategy through this judgment.

Return exactly one JSON object, no fences, with `$schema` = `ubp-independent-response-adjudication-v1` and `adjudications` array. Include each supplied `response_id` exactly once. Each item has only `response_id`, `case_id`, `judgment` (`correct`, `incorrect`, `incomplete`, or `ambiguous`), and `reasons` (an array of short factual strings). Ground reasons in the source data and mission. No implementation advice, provider ranking or promotion decision.
