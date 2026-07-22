# Development Guide & Coding Rules

This document covers the implementation architecture, hard coding rules, and separation of concerns for `@stateful-mcp/clinical`.

---

## 1. Separation of Concerns: Tokenization vs Semantic Parsing

The core parsing stack is refactored into four distinct layers to enforce testability, language neutrality, and single-responsibility.

```
Raw Text
  │
  ▼
CDSL Stream Tokenizer  (cdsl-parser.ts)
  │  Pure text segmentation: tags, delimiters, macros, variables
  │  Output: CdslToken[]
  │
  ▼
Schema Tokenizers  (one per schema class)
  │  Apply evaluatorRules + attributeRules
  │  Output: Structured tokens (anchor, value, unit, flags, etc.)
  │
  ▼
Schema Parsers  (schema-parsers.ts)
  │  Resolve concepts, apply concept defaults, assemble final objects
  │  Output: Final schema objects (ObservationEvent, VitalsMeasurementEvent, etc.)
  │
  ▼
Schema Helpers  (pure functions only)
    No string parsing. Only semantic transformations on structured data.
```

### Layer 1 — CDSL Stream Tokenizer
**File:** `cdsl-parser.ts`

Responsible for splitting input into tagged chunks via delimiters (`||`, `|`), extracting tag tokens, resolving macros/variables, and guessing missing tags. Outputs `CdslToken[]` with **raw content strings only**.

### Layer 2 — Schema Tokenizers
Each schema class owns its tokenization contract:

- **`VitalsTokenizer`** → `VitalsToken { anchor, value?, unit?, systolic?, diastolic?, bloodPressureUnit? }`
- **`ObservationTokenizer`** → `ObservationToken { anchor, certainty?, severity?, status?, durationMagnitude?, durationUnit? }`
- **`MedicationTokenizer`** → `MedicationToken { anchor, route?, frequency?, duration?, quantity?, quantityUnit? }`

Responsible for applying `attributeRules` and `evaluatorRules` to extract structured tokens from raw strings. **No dictionary lookups or concept resolution.**

### Layer 3 — Schema Parsers
`schema-parsers.ts` becomes a coordinator. Each `SchemaParser.parse()` follows a 4-step pipeline:
1. `tokenize` — delegate to schema tokenizer
2. `resolve` — dictionary lookup for anchor concept
3. `applyDefaults` — merge `ParserConceptDefaultStore` values
4. `assemble` — construct final schema object

### Layer 4 — Helpers (pure functions only)
Helpers perform semantic transformations on already-structured data. No string parsing.

| Current | Target Pure Function |
|---|---|
| `ObservationHelper.parseSeverity(groups)` | `ObservationHelper.computeScore(numerator, denominator?)` |
| `VitalsHelper.findBloodPressure(groups)` | `VitalsHelper.buildBloodPressure(systolic, diastolic, unit?)` |
| `VitalsHelper.getVitalsSeverity(val, min, max)` | Keep as-is (already pure) |
| `MedicationHelper.parseQuantityUnit(groups)` | `MedicationHelper.normalizeUnit(quantity, rawUnit, rules?)` |
| `MeasurementHelper.parse(text)` | Split into `MeasurementToken` tokenizer + unit resolver |
| `TimeHelper.parse(text)` | Split into `TimeToken` tokenizer + unit resolver |

### Where Regex Patterns Live
| Pattern set | Owner | Consumer |
|---|---|---|
| `DEFAULT_ATTRIBUTE_RULES` | `defaults.ts` | Schema tokenizers |
| `DEFAULT_EVALUATOR_RULES` | `defaults.ts` | Schema tokenizers |
| `SEED_CONCEPT_DEFAULTS` | `defaults.ts` | Schema parsers (post-tokenization) |

---

## 2. Hard Coding Rules

### 2.1 Zero-Bias Parsing
> [!IMPORTANT]
> **Strict Coding Guideline**: Under no circumstances should English-centric matching (e.g., hardcoded substring parsing or English regexes like `hr`, `day`, `hours`) be assumed within helper parsers. 
> All unit translations, comparison operators (e.g., `aprox`, `alrededor de`), and enums must be resolved dynamically by consulting the parser syntax profile's `attributeRules` and `evaluatorRules`.

### 2.2 Regex Rules
1. **Named groups only for captured values**: All regex patterns that extract values must use named capture groups (`(?<name>...)`). Positional groups (`(...)`) are forbidden for values that are read back from the match.
2. **No hardcoded English fallbacks**: Helper classes must not include fallback blocks like `if (rawUnit.startsWith("hour") || rawUnit === "h")`. These violate the zero-bias rule. All such mappings must live in `DEFAULT_ATTRIBUTE_RULES` or profile-specific configurations.
3. **Profile-driven operators**: `MeasurementHelper` and `TimeHelper` must compile their operator/unit regexes dynamically from the active `ParserSyntaxProfile` rules, not from static enum arrays.

### 2.3 Layer Boundaries
1. **CDSL tokenizer** produces only `CdslToken[]`. It must not apply regex evaluation rules.
2. **Schema tokenizers** consume raw strings + rules. They must not query `DictionaryStore` or `ParserConceptDefaultStore`.
3. **Schema parsers** consume tokens + stores. They must not contain inline `applyEvaluatorRules` loops.
4. **Helpers** accept structured data (`groups`, `token` objects). They must not execute regex exec loops.

---

## 3. Schema Tokenizer Interfaces

Add tokenizer interfaces to each schema file:

```typescript
// vitals.ts
export interface VitalsToken { ... }
export class VitalsTokenizer { static tokenize(...) { ... } }

// observation.ts
export interface ObservationToken { ... }
export class ObservationTokenizer { static tokenize(...) { ... } }

// medication.ts
export interface MedicationToken { ... }
export class MedicationTokenizer { static tokenize(...) { ... } }
```

---

## 4. Helper Contracts

```typescript
// observation.ts
static computeScore(numerator: number, denominator?: number, baseScale = 10)

// vitals.ts
static buildBloodPressure(systolic: number, diastolic: number, unit?: string)
static classifyVitalsSeverity(val: number, normalMin: number, normalMax: number)

// medication.ts
static normalizeQuantityUnit(quantity: number, rawUnit: string, rules?: AttributeParserRule[])

// shared.ts (MeasurementHelper)
interface MeasurementToken { operator?: string; magnitude: number; rawUnit?: string; isApproximate?: boolean }
static tokenizeMeasurement(text: string, opPatterns: string[], unitRules?: AttributeParserRule[]): MeasurementToken | null
static resolveUnit(unitDisplay: string, unitRules?: AttributeParserRule[]): string

// shared.ts (TimeHelper)
interface TimeToken { magnitude: number; rawUnit?: string }
static tokenizeTime(text: string): TimeToken | null
static resolveTimeUnit(rawUnit: string, timeUnitRules?: AttributeParserRule[]): TimePrecisionLevel | undefined
```

---

## 5. Migration Steps

1. ✅ Add per-schema tokenizer interfaces to `schemas/*.ts`
2. 🔄 Implement `VitalsTokenizer`, `ObservationTokenizer`, `MedicationTokenizer`
3. 🔄 Refactor `schema-parsers.ts` to use tokenizers instead of inline `applyEvaluatorRules`
4. 🔄 Refactor `MeasurementHelper` and `TimeHelper` to pure token + resolver
5. 🔄 Deprecate `applyEvaluatorRules` as a standalone utility; move into tokenizers
6. ✅ Add tokenizer-level tests independent of full parser integration

---

## 6. Current Status

**Completed:**
- ✅ Removed hardcoded English fallback from `TimeHelper.parse` (now profile-driven only)
- ✅ Converted positional capture groups to named groups in `MeasurementHelper`
- ✅ Removed hardcoded English unit mapping from `MedicationHelper.parseQuantityUnit`
- ✅ Removed hardcoded English default-unit fallbacks from `VitalsSchemaParser`
- ✅ Updated `SEED_CONCEPT_DEFAULTS` to use named capture groups (`?<value>`, `?<unit>`)
- ✅ Fixed `VitalsSchemaParser` concept-default capture group access to use `match.groups` instead of positional indices
- ✅ Added optional `attributeRules` parameter to `MedicationHelper.parseQuantityUnit`
- ✅ Added optional `attributeRules` parameter to `applyEvaluatorRules` and passed it through to `parseQuantityUnit`

**In Progress / Pending:**
- 🔄 Implement `VitalsTokenizer`, `ObservationTokenizer`, `MedicationTokenizer`
- 🔄 Refactor `schema-parsers.ts` to adopt tokenizers
- 🔄 Split `MeasurementHelper` and `TimeHelper` into token + resolver
