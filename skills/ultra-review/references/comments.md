# Comments lens

Inspect changed comments, docstrings, examples, annotations and API documentation
against the associated implementation and public contract. Report factual
contradictions, stale names or behavior, unsafe operational advice, and an omission
only when it makes a public or non-obvious contract materially misleading.

TODO, FIXME, HACK and implementation narration are evidence to investigate, not
automatic defects. Ignore wording preferences and harmless redundancy. Use `axis:
engineering_standards`, category `comments`, and the shared findings schema.

The worker is read-only. Its only write is the assigned JSON artifact.
