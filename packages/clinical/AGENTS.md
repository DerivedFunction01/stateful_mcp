# Development Guide & Coding Rules

This document covers the implementation architecture, hard coding rules, and separation of concerns for `@stateful-mcp/clinical`.

---

## 1. Hard Coding Rules

### 1.1 Zero-Bias Parsing
> [!IMPORTANT]
> **Strict Coding Guideline**: Clinical text is inherently chaotic. The full NLP space is diverse, inconsistent, and non-deterministic, so implementations must not assume rigid ordering, fixed phrasing, or language-specific conventions. Under no circumstances should English-centric or locale-specific matching be assumed within helper parsers. This includes hardcoded substring parsing, hardcoded regex literals such as `hr`, `day`, `hours`, `ago`, `except`, `daily`, or any other language-specific vocabulary.
> The parser profile is the mechanism for bringing that chaos into order. Even when the broader NLP domain is varied, an individual person's writing style and a given clinical workflow are constrained and learnable. All unit translations, comparison operators, temporal markers (retrospective/prospective), boundary markers, exclusions, and enums must therefore be resolved dynamically by consulting the active parser syntax profile's `attributeRules` and `evaluatorRules`.

### 1.2 Regex Rules
1. **Named groups only for captured values**: All regex patterns that extract values must use named capture groups (`(?<name>...)`). Positional groups (`(...)`) are forbidden for values that are read back from the match.
2. **No hardcoded language fallbacks**: Helper classes must not include fallback blocks like `if (rawUnit.startsWith("hour") || rawUnit === "h")`, `if (text.includes("ago"))`, or `if (text.match(/daily|diario/))`. These violate the zero-bias rule. All such mappings must live in `DEFAULT_ATTRIBUTE_RULES` or profile-specific configurations. **Exception**: Interpreting already-resolved typed domain enum values (e.g., `FrequencyShorthand.BID`, `FrequencyShorthand.TID`) into their mathematical equivalents is not a language-specific fallback, because the text-to-enum recognition is rule-driven and the enum values themselves are locale-neutral semantic codes. The shared resolver for this logic lives in `FrequencyHelper.resolveShorthandInterval` and `FrequencyHelper.isHighFrequencyDayConversion`; all consumers must use these methods rather than reimplementing the switch.
3. **Profile-driven operators**: `MeasurementHelper`, `TimeHelper`, and any time/date-range helper must compile their operator/unit/marker regexes dynamically from the active `ParserSyntaxProfile` rules, not from static arrays or inline language assumptions.
4. **No fixed ordering assumptions**: Parsers must not assume that markers appear before or after the target phrase in a fixed language-specific order. Marker detection must be driven by rules that can match across locales and phrase structures, because the profile is responsible for imposing order on otherwise noisy clinical text. **Exception**: A helper may define a deterministic internal composition sequence (e.g., exclusions before cadence before boundaries) when that sequence reflects the mathematical structure of the domain model—not a grammatical word-order assumption. Allowed orderings must not encode language-specific phrase structures; they must derive from how the target type is logically composed, and all locale-specific markers within each step must still come from rules.

### 1.3 Layer Boundaries
1. **CdslParser** splits raw text by `profile.stateDelimiter`, extracts `(tag, content)` pairs, gates narrative segments via `StopWordParser`, builds `PreparsedContext` directly, and dispatches to schema parsers. It must not execute regex evaluation loops against raw segment text.
2. **Schema tokenizers** consume raw strings + rules/evaluatorRules and return plain token objects. They must not query `DictionaryStore` or `ParserConceptDefaultStore`.
3. **Schema parsers** consume tokens + stores + preparsedContext. They must not contain inline input-extraction loops; the only permitted inline regex is concept-default capture-group mapping against the original raw text.
4. **Helpers and tokenizers** accept structured token data or raw strings + rules. They may execute regex exec loops over rule patterns, but every semantic value (unit, operator, temporal marker, exclusion) must be resolved from rule match results, not from hardcoded substring checks or hardcoded regex literals outside the rule configuration.
5. **Schema helpers and tokenizers must remain locale-agnostic**: Any component handling units, dates, times, exclusions, or relative markers must resolve semantic meaning from `attributeRules` / `evaluatorRules` and not from hardcoded language literals.

### 1.4 Review Checklist
Before merging parser changes, confirm that:
- No new code hardcodes English, Spanish, or other locale-specific terms for units, operators, temporal markers, or exclusion markers.
- All units and markers are resolved from `attributeRules`/`evaluatorRules` or from a profile passed into the helper.
- Regexes use named groups for extraction and do not rely on positional capture groups for semantic values.
- The implementation would still work if the same sentence were expressed in another locale or with different word order, because the profile—not hardcoded assumptions—would provide the linguistic ordering and semantic constraints. If a fixed internal composition order exists, confirm that it reflects the mathematical/logical structure of the domain type, not a language-specific grammar pattern.