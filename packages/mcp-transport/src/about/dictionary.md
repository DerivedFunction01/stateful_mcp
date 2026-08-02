# Dictionary Service: Strategy & Guidelines

The Dictionary Service normalizes clinical or business terms to their authoritative coordinate mappings.

## Core Rules
* **Normalize Early**: Always resolve vernacular terminology (e.g. abbreviations, aliases) to formal concept codes before using them in filter conditions or object field values.
* **Explore**: Use `dictionary_find` to discover terms and synonyms.
* **Scope Resolution**: Personal aliases shadow global configurations. Rely on the resolved priority outputs.

## Resolution Metadata

`dictionary_resolve` returns the stable resolution status and candidate metadata:

- `sources`: source identifiers contributing candidates;
- `freshness`: `fresh`, `stale`, or `unknown` when supplied by the configured resolver;
- `authority`: whether the candidate is authoritative, derived, or user-provided;
- `partial`: whether the match is non-exact.

Transport clients should use this metadata for display and fallback decisions. SQL tables, cache keys, and synchronization internals are not part of the tool contract.
