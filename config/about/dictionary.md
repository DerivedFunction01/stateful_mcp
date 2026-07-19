# Dictionary Service: Strategy & Guidelines

The Dictionary Service normalizes clinical or business terms to their authoritative coordinate mappings.

## Core Rules
* **Normalize Early**: Always resolve vernacular terminology (e.g. abbreviations, aliases) to formal concept codes before using them in filter conditions or object field values.
* **Explore**: Use `dictionary_find` to discover terms and synonyms.
* **Scope Resolution**: Personal aliases shadow global configurations. Rely on the resolved priority outputs.
