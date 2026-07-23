# Development Guide & Coding Rules

This document covers the implementation architecture, hard coding rules, and separation of concerns for `@stateful-mcp/clinical`.

---

## 1. Hard Coding Rules

### 1.1 Zero-Bias Parsing
> [!IMPORTANT]
> **Strict Coding Guideline**: Under no circumstances should English-centric matching (e.g., hardcoded substring parsing or English regexes like `hr`, `day`, `hours`) be assumed within helper parsers. 
> All unit translations, comparison operators (e.g., `aprox`, `alrededor de`), and enums must be resolved dynamically by consulting the parser syntax profile's `attributeRules` and `evaluatorRules`.

### 1.2 Regex Rules
1. **Named groups only for captured values**: All regex patterns that extract values must use named capture groups (`(?<name>...)`). Positional groups (`(...)`) are forbidden for values that are read back from the match.
2. **No hardcoded English fallbacks**: Helper classes must not include fallback blocks like `if (rawUnit.startsWith("hour") || rawUnit === "h")`. These violate the zero-bias rule. All such mappings must live in `DEFAULT_ATTRIBUTE_RULES` or profile-specific configurations.
3. **Profile-driven operators**: `MeasurementHelper` and `TimeHelper` must compile their operator/unit regexes dynamically from the active `ParserSyntaxProfile` rules, not from static enum arrays.

### 1.3 Layer Boundaries
1. **CDSL tokenizer** produces only `CdslToken[]`. It must not apply regex evaluation rules.
2. **Schema tokenizers** consume raw strings + rules. They must not query `DictionaryStore` or `ParserConceptDefaultStore`.
3. **Schema parsers** consume tokens + stores. They must not contain inline `applyEvaluatorRules` loops.
4. **Helpers** accept structured data (`groups`, `token` objects). They must not execute regex exec loops.