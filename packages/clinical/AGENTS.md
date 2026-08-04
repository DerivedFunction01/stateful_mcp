# Development Guide & Coding Rules

This document covers the implementation architecture, hard coding rules, and separation of concerns for `@stateful-mcp/clinical`.

---

## 1. Hard Coding Rules

### 1.1 Zero-Bias Parsing
> [!IMPORTANT]
> **Strict Coding Guideline**: Clinical text is inherently chaotic. The full NLP space is diverse, inconsistent, and non-deterministic, so implementations must not assume rigid ordering, fixed phrasing, or language-specific conventions. Under no circumstances should English-centric or locale-specific matching be assumed within helper parsers. This includes hardcoded substring parsing, hardcoded regex literals such as `hr`, `day`, `hours`, `ago`, `except`, `daily`, or any other language-specific vocabulary.
> The parser profile is the mechanism for bringing that chaos into order. Even when the broader NLP domain is varied, an individual person's writing style and a given clinical workflow are constrained and learnable. All unit translations, comparison operators, temporal markers (retrospective/prospective), boundary markers, exclusions, and enums must therefore be resolved dynamically by consulting the active parser syntax profile.

### 1.2 Regex Rules
1. **Named groups only for captured values**: All regex patterns that extract values must use named capture groups (`(?<name>...)`). Positional groups (`(...)`) are forbidden for values that are read back from the match. 
2. **No hardcoded language fallbacks**: Helper classes must not include fallback blocks like `if (rawUnit.startsWith("hour") || rawUnit === "h")`, `if (text.includes("ago"))`, or `if (text.match(/daily|diario/))`. These violate the zero-bias rule. All such mappings must live in `DEFAULT_ATTRIBUTE_RULES` or profile-specific configurations. **Exception**: Interpreting already-resolved typed domain enum values (e.g., `FrequencyShorthand.BID`, `FrequencyShorthand.TID`) into their mathematical equivalents is not a language-specific fallback, because the text-to-enum recognition is rule-driven and the enum values themselves are locale-neutral semantic codes. The shared resolver for this logic lives in `FrequencyHelper.resolveShorthandInterval` and `FrequencyHelper.isHighFrequencyDayConversion`; all consumers must use these methods rather than reimplementing the switch.
3. **No fixed ordering assumptions**: Parsers must not assume that markers appear before or after the target phrase in a fixed language-specific order. When a quantity or unit rule is expressed as a full capture pattern, the pattern itself encodes the expected relative order. For rules that are still expressed as keyword matchers, directionality must not be hardcoded in the tokenizer.