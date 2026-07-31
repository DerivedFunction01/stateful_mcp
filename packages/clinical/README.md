# `@stateful-mcp/clinical` — Clinical DSL Backend Engine

This package provides the core backend parsing, vocabulary anchoring, and stateful SOAP Note engine for the Clinical IDE. It is designed to run offline or in serverless environments, decoupling clinical business rules from storage adapters (Postgres, SQLite, IndexedDB, OPFS, JSONL, memory) through strict Dependency Inversion.

---

## The Philosophy: Beyond Dropdown Fatigue & Stochastic LLMs

EHR (Electronic Health Record) systems suffer from **dropdown fatigue** — stacking checkboxes and nested menus onto legacy databases. Conversely, generative AI/LLM transcription introduces **semantic noise, liability, and hallucinations**.

This package implements **Clinical DSL (CDSL)**: a structured shorthand dictation grammar parsed deterministically in real time with **zero latency**. The engine resolves clinical concepts to standardized vocabularies (LOINC, SNOMED, RxNorm, ICD-10) and produces typed, structured SOAP Note objects.

---

## System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                         ClinicalEngine                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐  │
│  │  Encounter   │  │ processCdsl  │  │    signEncounter    │  │
│  │  Lifecycle   │  │   (parse +   │  │ (validate + lock +  │  │
│  │initEncounter │  │   route +    │  │      archive)       │  │
│  │  renderNote  │  │   persist)   │  │                     │  │
│  └──────┬───────┘  └──────┬───────┘  └─────────────────────┘  │
│         │                 │                                   │
│         ▼                 ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                        CdslParser                        │ │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌───────────┐   │ │
│  │  │ Variable │ │  Macro   │ │   Prose   │ │  Segment  │   │ │
│  │  │Expansion │ │Expansion │ │ Template  │ │ Processor │   │ │
│  │  │{var=...} │ │ (^macro) │ │ Matching  │ │           │   │ │
│  │  └──────────┘ └──────────┘ └───────────┘ └─────┬─────┘   │ │
│  │                                                │         │ │
│  │                                                ▼         │ │
│  │                                      ┌────────────────┐  │ │
│  │                                      │SegmentProcessor│  │ │
│  │                                      │ Tag Extract    │  │ │
│  │                                      │ Stop Word      │  │ │
│  │                                      │ Preparsed      │  │ │
│  │                                      │ Context        │  │ │
│  │                                      │ Concept        │  │ │
│  │                                      │ Resolution     │  │ │
│  │                                      │ Parser Dispatch│  │ │
│  │                                      │ Confidence     │  │ │
│  │                                      │ Scoring        │  │ │
│  │                                      └────────────────┘  │ │
│  └──────────────────────────────────────────────────────────┘│
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │               Storage Layer (Adapter Pattern)            │ │
│  │    parser/   │  reference/  │   learning/   │    sql/    │ │
│  │              (KV + SQL for each domain)                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                   Renderer (ProseRenderer)               │ │
│  │        Structured SOAP Note ──> Narrative Prose          │ │
│  └──────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 1. Clinical DSL (CDSL) Syntax

CDSL tags route dictation segments to specific strongly-typed schemas based on a configurable tag token and mapping profile:

| Tag | Schema | Example |
|-----|--------|---------|
| `#vital` | `VitalsMeasurementEvent` | `#vital temp 38.5 Cel` |
| `#observation` | `ObservationEvent` | `#observation denies chest pain` |
| `#med` | `MedicationOrderObject` | `#med Amoxicillin oral TID 10 days` |
| `#dx` | `PrimaryDiagnosisEntry` | `#dx hypertension` |
| `#allergy` | `AllergyEntry` | `#allergy penicillin` |
| `#plan` | `InvestigationOrderObject` | `#plan CBC panel` |

Clinicians can configure the parser with a custom `ParserSyntaxProfile` containing multilingual tag aliases, localized attribute mappings, and namespace priorities.

---

## 2. Parsing Pipeline

The `CdslParser` processes raw dictation through a multi-stage pipeline:

### Stage 1: Variable Expansion
Resolves `{var=value}` blocks using `CdslVariableParser`. Variables are stored in a `VariableService` and can be referenced in subsequent text. Assertions (`{x > 40}`) can gate whether text is included.

### Stage 2: Macro Expansion
Expands `^macroName(arg1, arg2)` macros using `MacroExpander`. Macros are defined in `ParserMacroStore` and support recursive expansion up to a configurable depth.

### Stage 3: Prose Template Matching
`ProseParser` matches registered prose templates against the text using regex patterns. Matched sections are consumed and parsed into structured items; unmatched remnants continue to the segment processor.

### Stage 4: Segment Splitting
The remaining text is split by `profile.stateDelimiter` (default `||`) into individual segments.

### Stage 5: Per-Segment Processing (`SegmentProcessor`)

For each segment:

1. **Tag Extraction** — Extracts `#tag` prefix from segment text
2. **Stop Word Gating** — Checks if segment is conversational narrative (skipped if stop word ratio exceeds threshold)
3. **PreparsedContext Building** — Runs helpers to extract structured data:
   - `QuantityTokenizer` — extracts magnitude, unit, operator from text
   - `ClinicalDateRangeTokenizer` — extracts dates, ranges, exclusions (5-step composition: exclusions → cadence/repeat → calendar dates → relative estimate → boundaries)
   - `FrequencyHelper` — resolves PRN, event anchors, shorthand intervals (QD/BID/TID/QID), rate-based frequencies
4. **Concept Resolution** — Dictionary lookup for concept resolution (multi-word term preservation, namespace filtering)
5. **ConceptFieldRule Resolution** — Looks up field routing rules for resolved concepts
6. **Parser Dispatch** — Tag-based + concept-based routing to the appropriate `SchemaParser`
7. **Confidence Scoring** — `GenericConfidenceScorer` ranks candidates, applies threshold (0.5), selects winners

### Stage 6: Post-Parse Enrichment

- **Shared Field Anchoring** — Links related items across the note using anchor rules (e.g., linking a medication to the diagnosis it treats)
- **Deduplication** — Prevents duplicate items

---

## 3. Stateful Clinical Engine (`ClinicalEngine`)

The `ClinicalEngine` coordinates the parser and stateful core services:

### Encounter Lifecycle

| Method | Purpose |
|--------|---------|
| `initEncounter(sessionId, patient)` | Creates a new SOAP Note draft with empty structured sections |
| `processCdsl(sessionId, dictation)` | Parses CDSL dictation, resolves concepts, routes items to SOAP sections, persists parsed cells, reconciles event-sourced state |
| `signEncounter(sessionId, signedBy)` | Runs EvaluatorStore validation rules, locks the note, archives to `SignedSoapNoteStore` |
| `renderNote(sessionId)` | Renders narrative fields using prose templates (computed view, does not persist) |

### Git-like VCS Compaction
Mutates SOAP Note objects on sub-paths (`set`), compiling a transaction history of structural revisions via the EventStore. `reconcileEventStateToObjectStore()` projects EventStore commits back to the ObjectStore read-model.

### SOAP Routing
The engine uses `SOAP_ROUTING_CONFIGS` — a record mapping 20+ canonical schema names to their SOAP Note path, ID prefix, field mapping function, and optional default fallbacks. Each config specifies:
- `getPath()` — where in the SOAP note the item goes
- `mapFields()` — how extracted data maps to SOAP fields
- `defaultFallbacks` — default values for missing fields
- `isCollection` — whether the target is an array or single object

---

## 4. Clinical Data Model (`src/schemas/`)

The system defines 15 schema files forming a complete clinical data model:

| Schema | Purpose |
|--------|---------|
| `document.ts` | `SoapNote` — root document with subjective, objective, assessment, plan sections |
| `shared.ts` | `CodeableConcept`, `Certainty`, `Status`, `ClinicalSourceType`, `Route`, `OrganSystem`, `AnatomicalLocation` |
| `measurement.ts` | Unit anchors, physical/physiological/engineering measurement types |
| `time.ts` | `TimePrecisionLevel`, `TemporalBoundary`, `TimeInterval`, `ClinicalDateRange` |
| `patient.ts` | `PatientProfile`, `PatientLearningBucket` |
| `vitals.ts` | `VitalsMeasurementEvent` + variants (BP, HR, RR, SpO2, Temp, Weight, Height) |
| `observation.ts` | `ObservationEvent` — with certainty, status, severity, duration, trajectory |
| `medication.ts` | `MedicationOrderObject`, `MedicationFrequency`, frequency shorthands |
| `assessment.ts` | `PrimaryDiagnosisEntry`, `DifferentialDiagnosisEntry`, `AlgorithmicEvaluationObject` |
| `history.ts` | `AllergyEntry`, `SocialHistoryEntry`, `ReportedMedicationEntry`, `PatientHistories` |
| `plan.ts` | `InvestigationOrderObject`, `ReferralOrderObject`, `InterventionOrderObject`, `SafetyNettingPlan` |
| `exposure.ts` | `ExposureEvent` — Chemical/Pharmaceutical/Biological subtypes |
| `injury.ts` | `MechanicalInjuryObject`, `ProtectiveEquipmentObject` |
| `environment.ts` | `EnvironmentContextObject` — terrain, weather, combat, employment modalities |
| `diagnostic.ts` | `LabPanelResult`, `LabAnalyte`, `DeviceDiagnosticObject` |

---

## 5. Storage Architecture

The clinical backend depends on storage-agnostic repository interfaces defined in `src/store/interfaces.ts`. Each store domain supports multiple backends via a unified adapter registry:

### Store Domains

| Domain | Purpose | Backends |
|--------|---------|----------|
| `parser` | Parser profiles, concept defaults, rules, tags, macros, shared field anchors | memory, sqlite, jsonl |
| `reference` | Auto-complete, calibration, facilities, jurisdictional displays, personnel, prose templates, stop words | memory, sqlite |
| `learning` | Parsed cell history, ordered learning, autocomplete transitions | memory, sqlite, jsonl, opfs |
| `dictionary` | Concept and synonym resolution | (future adapter-backed) |
| `soap_note` | Durable SOAP note/document storage | (configurable) |
| `patient_store` | Patient and patient-context storage | (configurable) |
| `concept_fields` | Concept-to-field routing rules | memory |
| `shared_field_anchors` | Post-parse shared field anchor rules | memory |
| `parser_profiles` | Parser profile and profile-tag backends | memory |
| `parser_macros` | Parser macro definition and expansion backends | memory |
| `parser_rules` | Parser attribute rules, evaluator rules, and bindings | memory |
| `calibration` | Calibration exception store | memory |
| `personnel` | Personnel store | memory |
| `facilities` | Facility store | memory |

### Key Interfaces

- `ParserSyntaxProfile` — Configuration for parser behavior (tag token, delimiters, attribute rules, evaluator rules, schema namespaces, stop word threshold, etc.)
- `ParserConceptDefaultStore` — Concept-to-schema default mappings
- `ConceptFieldStore` — Concept-to-field routing rules
- `CalibrationStore` — Unmapped slang word audit queue
- `ClinicalProseTemplateStore` — Narrative prose template configurations
- `SignedSoapNoteStore` — Long-term legal archive
- `AdministrativeStore` — Facility & Personnel directories
- `JurisdictionalDisplayStore` — Preferred display names by region
- `StopWordStore` / `StopWordWordListStore` — Stop word compilation
- `ParserMacroStore` — Macro definition storage
- `EvaluatorStore` — Clinical safety validation rules

### Runtime Wiring

`createClinicalRuntime()` in `clinical-runtime.ts` resolves all stores via the adapter registry, composes the parser profile using `DefaultParserProfileComposer`, and returns a fully wired `ClinicalRuntime`. The `buildClinicalRuntime()` factory in `clinical-loader.ts` loads config from a JSON file or falls back to defaults.

---

## 6. Renderer (`src/renderer/`)

The renderer converts structured SOAP Notes into narrative prose:

| Component | Purpose |
|-----------|---------|
| `ProseRenderer` | Renders SOAP note sections (HPI, objective, assessment, plan) using prose templates with slot-based delegation |
| `TemplateRenderer` | Core template engine with token extraction, slot resolution, delegate chaining, conditional rendering, pipeline transforms |
| `TemplateWalker` | Validates template cycles and nesting depth |

The renderer uses `ClinicalProseTemplate` objects with `slotPosition` values (`opening`, `continuing`, `closing`, `full_paragraph`) to determine which template applies to which section of the note.

---

## 7. Configuration & Seeding (`src/seed/`)

- `defaults.ts` — Test/fixture defaults only (`DEFAULT_ATTRIBUTE_RULES`, `DEFAULT_CALENDAR_DATE_FORMATS`, `SEED_PARSER_PROFILES`, numeric pattern generators). **Not for runtime use.**
- `clinical-config-seed.ts` — `DEFAULT_CLINICAL_STORE_CONFIG` — full default config with adapter registries for all store domains.
- `loader.ts` — `seedClinicalData()`, `seedStopWordLists()`, `seedStopWordProfiles()` for file-based seed loading.

Seed data files in the `seed/` directory:  `loinc_seed.json`, `snomed_seed.json`, `rxnorm_seed.json`, `icd10_seed.json`

---

## 8. Key Design Principles

### Zero-Bias Parsing
Clinical text is inherently chaotic. The parser must not assume rigid ordering, fixed phrasing, or language-specific conventions. All unit, operator, temporal marker, and exclusion mappings are resolved dynamically from the active `ParserSyntaxProfile`'s `attributeRules` and `evaluatorRules`.

### Named Group Contracts
All regex patterns that extract values must use named capture groups (`(?<name>...)`). Positional groups are forbidden for values that are read back from the match.

### Profile-Driven Helpers
Helpers and tokenizers must compile their regexes dynamically from the active `ParserSyntaxProfile` rules, not from static arrays or inline language assumptions.

### PreparsedContext as Shared-Pass Artifact
The `PreparsedContext` exists so schema parsers can reuse cross-cutting outputs (measurement candidates, time candidates, frequency) without re-running regex work. Schema parsers receive the full candidate bag and select at output time.

### Dependency Inversion
The clinical backend depends on storage-agnostic repository interfaces. Any combination of backends (memory, SQLite, OPFS, JSONL, Postgres via adapter) can be wired through the `ClinicalStoreConfig` adapter registry.

---

## 9. Unification Considerations

The system has clear separation of concerns but several areas where unification could reduce friction:

1. **Parser initialization** — The `CdslParser.create()` factory + `ClinicalEngine.create()` factory pattern could be simplified into a single builder/factory.
2. **Store adapter resolution** — The adapter registry pattern is consistent across all domains but requires repetitive config definitions.
3. **Schema parser registration** — The global `schemaParserRegistry` could be auto-discovered or auto-registered.
4. **SOAP routing** — The `SOAP_ROUTING_CONFIGS` could be derived from schema metadata rather than hardcoded.
5. **Test infrastructure** — Tests use a mix of direct imports, `require()`, and factory patterns; a shared test helper could reduce boilerplate.

---

For implementation architecture, coding rules, and the separation of concerns plan, see [AGENTS.md](AGENTS.md).