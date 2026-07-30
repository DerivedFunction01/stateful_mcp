# Development Guide & Coding Rules

This document covers the implementation architecture, hard coding rules, and separation of concerns for `@stateful-mcp/clinical`.

---

## 1. Hard Coding Rules

### 1.1 Zero-Bias Parsing
> [!IMPORTANT]
> **Strict Coding Guideline**: Clinical text is inherently chaotic. The full NLP space is diverse, inconsistent, and non-deterministic, so implementations must not assume rigid ordering, fixed phrasing, or language-specific conventions. Under no circumstances should English-centric or locale-specific matching be assumed within helper parsers. This includes hardcoded substring parsing, hardcoded regex literals such as `hr`, `day`, `hours`, `ago`, `except`, `daily`, or any other language-specific vocabulary.
> The parser profile is the mechanism for bringing that chaos into order. Even when the broader NLP domain is varied, an individual person's writing style and a given clinical workflow are constrained and learnable. All unit translations, comparison operators, temporal markers (retrospective/prospective), boundary markers, exclusions, and enums must therefore be resolved dynamically by consulting the active parser syntax profile's `attributeRules` and `evaluatorRules`.
> `src/seed/defaults.ts` contains seed/test configuration, not runtime constraints. In a real deployment, all defaults are configurable via `ParserSyntaxProfile` (UI-configured, out of scope for now). Seed data in `defaults.ts` is therefore not treated as a violation; it is a starting point that profile authors are expected to override.

### 1.2 Regex Rules
1. **Named groups only for captured values**: All regex patterns that extract values must use named capture groups (`(?<name>...)`). Positional groups (`(...)`) are forbidden for values that are read back from the match. `AttributeParserRule.regexPatterns` are permitted to carry named capture groups such as `magnitude`, `unit`, `operator`, and `is_approximate`; in this case the rule itself defines the full extraction shape, including directionality and adjacency.
2. **No hardcoded language fallbacks**: Helper classes must not include fallback blocks like `if (rawUnit.startsWith("hour") || rawUnit === "h")`, `if (text.includes("ago"))`, or `if (text.match(/daily|diario/))`. These violate the zero-bias rule. All such mappings must live in `DEFAULT_ATTRIBUTE_RULES` or profile-specific configurations. **Exception**: Interpreting already-resolved typed domain enum values (e.g., `FrequencyShorthand.BID`, `FrequencyShorthand.TID`) into their mathematical equivalents is not a language-specific fallback, because the text-to-enum recognition is rule-driven and the enum values themselves are locale-neutral semantic codes. The shared resolver for this logic lives in `FrequencyHelper.resolveShorthandInterval` and `FrequencyHelper.isHighFrequencyDayConversion`; all consumers must use these methods rather than reimplementing the switch.
3. **Profile-driven operators**: `MeasurementHelper`, `TimeHelper`, and any time/date-range helper must compile their operator/unit/marker regexes dynamically from the active `ParserSyntaxProfile` rules, not from static arrays or inline language assumptions.
4. **No fixed ordering assumptions**: Parsers must not assume that markers appear before or after the target phrase in a fixed language-specific order. When a quantity or unit rule is expressed as a full capture pattern, the pattern itself encodes the expected relative order. For rules that are still expressed as keyword matchers, directionality must not be hardcoded in the tokenizer. **Exception**: A helper may define a deterministic internal composition sequence when it reflects the mathematical structure of the domain model—not a grammatical word-order assumption. Allowed orderings must not encode language-specific phrase structures; they must derive from how the target type is logically composed, and all locale-specific markers within each step must still come from rules. **Current example**: `ClinicalDateRangeHelper.tokenize` uses a 5-step composition sequence: (1) exclusions, (2) cadence/repeat, (3) calendar dates, (4) relative estimate, (5) boundaries.

### 1.3 Layer Boundaries
1. **CdslParser** splits raw text by `profile.stateDelimiter`, extracts `(tag, content)` pairs, gates narrative segments via `StopWordParser`, and builds `PreparsedContext` as a shared-pass artifact before dispatching to schema parsers. It **is permitted to execute shared-helper pre-computation** on raw segment text using rule-driven helpers (`QuantityTokenizer`, `TimeHelper`, `MeasurementHelper`, `FrequencyHelper`, attribute-rule scans), because `PreparsedContext` exists specifically so schema parsers can reuse these cross-cutting outputs without re-running regex work. **What remains forbidden** is schema-specific inline extraction: CdslParser must not execute raw regex evaluation loops tailored to a single schema target. Schema-specific extraction must live in the relevant schema tokenizer. Future optimization: if a tag is present, CdslParser should run only the helper passes relevant to that tag's schema family, as defined by the active `ParserSyntaxProfile`.<br/><br/>**Multi-candidate contract:** `QuantityTokenizer.tokenize()` now returns `QuantityCandidate[]` (all matching candidates), not a single `QuantityToken | null`. Every rule pattern in `attributeRules` is evaluated independently; every match with a numeric magnitude produces a candidate. `PreparsedContext.measurement` and `PreparsedContext.timeSpan` store `QuantityCandidate[]` — the full candidate bag, not a single winner. Schema parsers receive the full bag and select candidates at output time based on their typed interface, not at extraction time. `QuantityCandidate` extends `QuantityToken` with `tokenStart`, `tokenEnd`, and optional `sourceRule` fields for position-aware selection. The `numericRules` extraction-time filter is removed; all rules are evaluated and schema parsers filter the candidate bag after receipt.
2. **Schema tokenizers** consume raw strings + rules/evaluatorRules and return plain token objects. They must not query `DictionaryStore` or `ParserConceptDefaultStore`.
3. **Schema parsers** consume tokens + stores + preparsedContext. They must not contain inline input-extraction loops; the only permitted inline regex is concept-default capture-group mapping against the original raw text.
4. **Helpers and tokenizers** accept structured token data or raw strings + rules. They may execute regex exec loops over rule patterns, but every semantic value (unit, operator, temporal marker, exclusion) must be resolved from rule match results, not from hardcoded substring checks or hardcoded regex literals outside the rule configuration.
5. **Schema helpers and tokenizers must remain locale-agnostic**: Any component handling units, dates, times, exclusions, or relative markers must resolve semantic meaning from `attributeRules` / `evaluatorRules` and not from hardcoded language literals.

### 1.4 Review Checklist
Before merging parser changes, confirm that:
- No new code hardcodes English, Spanish, Chinese, Russian, Arabic, or other locale-specific terms for units, operators, temporal markers, or exclusion markers.
- All units and markers are resolved from `attributeRules`/`evaluatorRules` or from a profile passed into the helper.
- Regexes use named groups for extraction and do not rely on positional capture groups for semantic values.
- CdslParser shared-helper pre-computation is limited to rule-driven helper orchestration; schema-specific extraction is delegated to tokenizers.
- Schema parsers do not contain inline input-extraction loops; the only permitted inline regex is concept-default capture-group mapping against the original raw text.
- Schema parsers select from the `PreparsedContext` candidate bag (`QuantityCandidate[]`) at output time, not at extraction time.
- Schema tokenizers own schema-specific extraction loops.
- The implementation would still work if the same sentence were expressed in another locale or with different word order, because the profile—not hardcoded assumptions—would provide the linguistic ordering and semantic constraints. If a fixed internal composition order exists, confirm that it reflects the mathematical/logical structure of the domain type, not a language-specific grammar pattern.

---

## 2. Storage Architecture Patterns

### 2.1 Adapter Registry Pattern

Every store domain supports multiple backends via a unified adapter registry defined in `ClinicalStoreConfig` (`src/store/clinical-config.ts`). Each domain (`parser`, `reference`, `learning`, `ordered_learning`, `autocomplete`, etc.) has a `ClinicalStoreDomainConfig` with an array of `ClinicalStoreBackendConfig` entries. Each entry specifies:

- `primary` — the primary adapter locator (`_type: "adapter"`, `name: "memory" | "sqlite" | "jsonl" | "opfs" | "indexeddb" | "localstorage"`)
- `fallbacks` — fallback adapters tried in order
- `weights` — optional weight locator for scoring/ranking
- `implemented` — whether the adapter is fully implemented

The `getClinicalAdapterConfigs()` function (`src/store/adapter-types.ts`) retrieves the adapter array for a given domain from the config.

### 2.2 KV vs SQL Backends

Each store domain has two implementation families:

| Backend Type | Classes | Use Case |
|-------------|---------|----------|
| **KV** | `KvXxxStore` | In-memory (`MemoryKvBackend`), JSONL (`JsonlKvBackend`), IndexedDB (`IndexedDbKvBackend`), OPFS (`LocalStorageKvBackend`) |
| **SQL** | `SqlXxxStore` | SQLite, Postgres, DuckDB, OPFS via `SqlBackend` + `SqlExecutor` |

**KV stores** use the `KvBackend` interface from `@stateful-mcp/core`. They are simple key-value stores with `get`, `set`, `delete`, `list` operations. They are the default for development and lightweight deployments.

**SQL stores** use `SqlBackend.connect(dialect, dbPath)` to establish a connection, then `SqlExecutor` to run compiled queries. They support full relational features (JOINs, indexes, foreign keys, CTEs).

**Resolution pattern** (in `parser-backend-resolver.ts`, `learning-backend-resolver.ts`, etc.):
1. Check `locator._type === "adapter"` and `locator.name`
2. For SQL adapters (`sqlite`, "postgres", `duckdb`, `opfs`): call `SqlBackend.connect(dialect, dbPath)`, create `SqlExecutor`, return the SQL store
3. For KV adapters (`memory`, `jsonl`, `indexeddb`, `localstorage`): create the appropriate `KvBackend`, return the KV store
4. Throw on unsupported adapter names

### 2.3 SQL Query Compiler Pattern

SQL operations are compiled programmatically using `QueryCompiler` from `@stateful-mcp/core`. Each store domain has a corresponding query compiler in `src/store/sql/`:

| Compiler | Store Domain |
|----------|-------------|
| `ConceptDefaultQueryCompiler` | concept_defaults |
| `ConceptFieldQueryCompiler` | concept_fields |
| `MacroQueryCompiler` | macros |
| `ProfileQueryCompiler` | parser_profiles |
| `RuleQueryCompiler` | parser_rules |
| `AnchorQueryCompiler` | shared_field_anchors |
| `ParsedCellQueryCompiler` | learning/parsed_cell |
| `OrderedLearningQueryCompiler` | learning/ordered_learning |
| `AutocompleteTransitionQueryCompiler` | learning/autocomplete |
| `ReferenceQueryCompiler` | reference data (tags, jurisdictional displays, etc.) |

**SQL AST rules** — All query compilers follow these conventions:

1. **DDL methods** return `CompiledQuery[]` arrays. Each method (`getTableDDL`, `getIndexDDL`) compiles table creation and index creation statements.
2. **DML methods** return single `CompiledQuery` objects. Methods follow naming: `compileGetQuery`, `compileListQuery`, `compileUpsertQuery`, `compileDeleteQuery`.
3. **Dialect handling** — `SqlDialect` (`"sqlite"`, `"postgres"`, `"duckdb"`, `"opfs"`) controls dialect-specific syntax. The most common difference is conflict resolution: SQLite uses `ON CONFLICT REPLACE`, while Postgres uses `ON CONFLICT ... DO UPDATE`.
4. **Column definitions** use `ColumnDef` with `type` (`"TEXT"`, `"INTEGER"`, `"REAL"`, `"json"`), `nullable`, `primaryKey`, `default`, `raw` (raw SQL fragment for foreign keys), and `checks` (CHECK constraints).
5. **Query conditions** use `QueryCondition` objects with `column`, `op` (`"eq"`, `"gt"`, `"lt"`, `"gte"`, `"lte"`, `"like"`), and `value`.
6. **Compiled queries** are `CompiledQuery` objects with `sql` and `params` arrays, keeping SQL and parameters separate for safety.

### 2.4 Parsed Cell Transforms

Per-schema transform functions in `src/store/learning/parsed_cell/transforms/` convert parsed items into a normalized storage format. Each transform implements `ParsedCellRecordTransform`:

```typescript
interface ParsedCellRecordTransform {
  targetSchema: string;
  flatten(parsedItem: ParsedItem): Record<string, any>;
  template(): ParsedItem;
  indexes?: TransformIndexSpec[];
  columnSpecs?: ColumnDef[];
}
```

Transforms are registered in a global `transformRegistry` Map via `registerTransform()`. The `getTransformForSchema()` function retrieves the appropriate transform at runtime. Current transforms: `assessment-transforms`, `diagnostic-transforms`, `exposure-injury-transforms`, `history-transforms`, `medication-transform`, `observation-transform`, `plan-transforms`, `vitals-transform`, `clinical-date-range-transform`, `flatten-helper`.

### 2.5 Composite Store Pattern

The `CompositeParsedCellHistoryStore` (`src/store/learning/parsed_cell/history-store.ts`) combines multiple `ParsedCellHistoryStore` adapters with weighted scoring. It implements both `ParsedCellHistoryStore` and `ParsedCellWeightedHistoryStore`, merging results from all adapters and sorting by `rankScore`.

### 2.6 Profile Composition

The `DefaultParserProfileComposer` (`src/store/parser/parser-composer.ts`) assembles a complete `ParserSyntaxProfile` from separate stores:
- `profiles.core` — base profile settings
- `profiles.tags` — tag-to-schema mappings
- `refs.tags` — reference tag data
- `rules.attributeRules` — attribute parsing rules
- `rules.evaluatorRules` — evaluator rules
- `rules.attributeBindings` — profile-to-attribute-rule bindings
- `rules.evaluatorBindings` — profile-to-evaluator-rule bindings

---

## 3. Parsing Pipeline Patterns

### 3.1 Segment Processing Contract

The `SegmentProcessor` (`src/parser/cdsl-segment-processor.ts`) is the central dispatch point for per-segment parsing. Its `processSegment()` method returns a `SegmentParseState` containing:
- `tag` — extracted tag (e.g., `#vital`)
- `content` — text after tag removal
- `preparsedContext` — shared-pass artifact with measurement/time/frequency candidates
- `conceptFieldRules` — `ConceptFieldRule[]` for resolved concepts
- `mappedParser` — tag-based parser mapping (may be undefined)
- `parsersToRun` — final list of schema parsers to invoke (union of tag-based and concept-based)

### 3.2 Confidence Scoring

The `GenericConfidenceScorer` (`src/store/learning/parsed_cell/confidence-scorer.ts`) scores parsed candidates using:
- `weightStore` — `SystemWeightStore` for scoring weights
- `historyStore` — `ParsedCellHistoryStore` for prior acceptance/correction history

Candidates scoring below 0.5 are filtered out; if no candidates pass the threshold, the top-scoring candidate is selected as a fallback.

### 3.3 Shared Field Anchoring

Post-parse enrichment in `CdslParser.parseWithStopWordParser()` links related items across the note using `SharedFieldAnchorStore` rules. Anchor rules specify:
- `source` — the source schema to anchor from
- `target` — the target schema to anchor to
- `targetField` — dot-separated path in the target's `extractedData`
- `distance` — max char/word distance, boundary delimiter, transitional words
- `anchorPattern` — optional regex the gap text must match
- `condition` — optional pipeline condition

---

## 4. Key Interfaces

### 4.1 Parser Syntax Profile

`ParserSyntaxProfile` (`src/store/interfaces.ts`) is the central configuration object driving all parsing behavior. Key fields:

| Field | Purpose |
|-------|---------|
| `tagToken` | CDSL tag prefix (default `#`) |
| `stateDelimiter` | Segment splitter (default `||`) |
| `stateStartDelimiter` / `stateEndDelimiter` | Object boundary delimiters within a segment |
| `macroStartToken` | Macro expansion prefix (default `^`) |
| `variableStartToken` / `variableEndToken` | Variable block delimiters (default `{` / `}`) |
| `attributeRules` | Profile-driven regex rules for enum/attribute extraction |
| `evaluatorRules` | Dynamic regex capture evaluators |
| `schemaNamespaces` | Maps schema keys to prioritized vocabularies |
| `stopWordThreshold` | Ratio above which tagless segments are treated as narrative |
| `schemaDefaults` | Default values per schema per field |
| `defaultsStrategy` | Strategy name for default resolution |
| `calendarDateFormats` | Date format configurations |
| `numericFieldFormats` | Numeric field format configurations |
| `boundaryDelimiter` | Delimiter for shared field anchor boundary checks |
| `transitionalWords` | Words that indicate a boundary crossing |

### 4.2 ParsedItem

The output of parsing:

```typescript
interface ParsedItem {
  targetSchema: string;
  attributes: Record<string, any>;
  concept: CodeableConcept[];
  rawText: string;
  tag: string;
  extractedData: Record<string, any>;
  conceptFields?: Record<string, CodeableConcept[]>;
}
```

### 4.3 PreparsedContext

Shared-pass artifact available to all schema parsers:

```typescript
interface PreparsedContext {
  rawText: string;
  normalizedText?: string;
  candidates: Record<string, QuantityCandidate[]>;
  looseCandidates: QuantityCandidate[];
  timeCandidates: QuantityCandidate[];
  frequency?: MedicationFrequency | null;
  attributes: Record<string, string>;
  parsedPartial?: Record<string, any>;
  profile?: Pick<ParserSyntaxProfile, "schemaDefaults" | "defaultsStrategy">;
  rankingSignals?: RankingSignal;
  patientContext?: PatientLearningContext;
}
```

---

## 5. Clinical Engine Lifecycle

```
initEncounter → processCdsl → [repeat] → signEncounter
```

1. **initEncounter**: Creates a `SoapNote` object with empty sections, registers the `SoapNote` schema in `ObjectStore`, initializes an empty array in `EventStore`.
2. **processCdsl**: Parses dictation text through the CDSL pipeline, persists each parsed item as a `ParsedCellRecord` to `ParsedCellStore`, appends events to `EventStore`, reconciles event state back to the ObjectStore read model.
3. **signEncounter**: Runs `EvaluatorStore` validation rules, transitions note status to `"signed"`, archives to `SignedSoapNoteStore`.

The `reconcileEventStateToObjectStore()` method projects EventStore commits back to the ObjectStore read-model using `projectEventRecordsToSoapNote()`, which dynamically clears and rebuilds target paths from `SOAP_ROUTING_CONFIGS`.