# `@stateful-mcp/clinical` — Clinical IDE & CDSL Backend Engine

This package provides the core backend parsing, vocabulary anchoring, and stateful SOAP Note engine for the Clinical IDE. It is designed to run offline or in serverless environments, decoupling clinical business rules from storage adapters (Postgres, SQLite, IndexedDB, etc.) through strict Dependency Inversion.

---

## The Philosophy: Beyond Dropdown Fatigue & Stochastic LLMs

Modern EHR (Electronic Health Record) systems suffer from **dropdown fatigue**—stacking checkboxes and nested menus onto legacy databases. Conversely, generative AI/LLM transcription introduces **semantic noise, liability, and latency** due to hallucinations.

This package implements **Clinical DSL (CDSL)**: a structured shorthand dictation grammar parsed deterministically in real time with **zero latency**.

```
                        [ Raw Text: "#vital temp is 38.5 Cel" ]
                                     │
                                     ▼
                     ┌──────────────────────────────┐
                     │   Identify Anchor Main Term  │ ──► Resolves "temp" to LOINC:8310-5
                     └──────────────┬───────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │   Extract Numeric Quantity   │ ──► Matches "38.2"
                     └──────────────┬───────────────┘
                                    │
                                    ▼
                     ┌──────────────────────────────┐
                     │   Auto-Fill Schema Defaults  │ ──► Propagates unit = "Cel",
                     └──────────────────────────────┘     target_schema = "VitalsMeasurementEvent"
```

---

## 1. Clinical DSL (CDSL) Syntax & Parser Profile

CDSL tags route dictation segments to specific strongly-typed schemas based on a configurable tag token and mapping profile:

* **Vitals (`VitalsMeasurementEvent`)**: `#vital temp 38.5 Cel` or `#vital bp 120/80`
* **Observations (`ObservationEvent`)**: `#observation denies chest pain` or `#symptom cough severe`
* **Medications (`MedicationOrderObject`)**: `#med Amoxicillin oral TID 10 days`

### Zero-Bias Internationalization (i18n) & Custom Aliases
Clinicians can configure the parser with a custom `ParserSyntaxProfile` containing:
* `tagToken`: Custom prefix (e.g., `$` instead of `#`).
* `tagMappings`: Maps custom or translated tag names to the canonical schema target keys.
* `attributeRules`: Regex patterns mapping localized terms to enums (e.g., matching `"niega"` $\rightarrow$ `certainty: "refuted"`, or `"grave"` $\rightarrow$ `severity: "severe"`).

```typescript
import { CANONICAL_TAGS, CdslParser } from "@stateful-mcp/clinical";

const esProfile = {
  profileId: "es_clinic",
  tagToken: "$",
  tagMappings: {
    signos_vitales: CANONICAL_TAGS.VITALS,     // Maps $signos_vitales to VitalsMeasurementEvent
    prescripcion: CANONICAL_TAGS.MEDICATION,   // Maps $prescripcion to MedicationOrderObject
  },
  attributeRules: [
    { targetField: "certainty", targetValue: "refuted", regexPatterns: ["\\bniega\\b"] }
  ]
};

const parser = new CdslParser(dictionaryStore, esProfile);
```

---

## 2. Dynamic Registry & Named Capture Group Evaluators

To support total flexibility in parsing, the parser uses a schema-specific registry:
1. **Dynamic Schema Routing**: The main `CdslParser` looks up the tag's target schema and delegates segment parsing to a registered `SchemaParser` factory class.
2. **Tier 1 named capture group evaluators**: Evaluators are bound to regex patterns configured dynamically in the parser profile (`evaluatorRules`). This avoids hardcoding regexes, supporting any valid capture pattern.
   * **Severity Evaluator (`parseSeverity`)**: Parses numeric ranges (`4/10`, `3 out of 5`) or scores (`give it a 7`), scaling values to a normalized scale.
   * **Blood Pressure Evaluator (`parseBloodPressure`)**: Extracts systolic and diastolic pressures (`120/80`) to standard payloads.
   * **Quantity & Unit Evaluator (`parseQuantityUnit`)**: Extracts values and maps shorthand units (e.g. `2h` $\rightarrow$ `2 hours`, `50mg` $\rightarrow$ `50 mg`).
   * **Session Variable Evaluator (`parseSessionVars`)**: Extracts context values declared in blocks (`{ x=10, y=true }`).

```typescript
// Example profile dictionary mapping evaluator rules
const customProfile = {
  ...esProfile,
  evaluatorRules: [
    {
      ruleId: "bp",
      targetField: "blood_pressure",
      evaluatorName: "parseBloodPressure",
      regexPatterns: ["(?<systolic>\\d{2,3})\\s*\\/\\s*(?<diastolic>\\d{2,3})"]
    }
  ]
};
```

---

## 3. Stateful Clinical Engine (`ClinicalEngine`)

The `ClinicalEngine` coordinates the parser and the stateful core services:
* **Encounter Life Cycle**: Initializes draft notes (`initEncounter`), appends CDSL parsed events (`processCdsl`), and locks notes via electronic signature (`signEncounter`).
* **Git-like VCS Compaction**: Mutates SOAP Note objects on sub-paths (`set`), compiling a transaction history of structural revisions.

```typescript
import { ClinicalEngine } from "@stateful-mcp/clinical";

const engine = new ClinicalEngine(objectStore, dictionaryStore, signedNoteStore);

// 1. Initialize encounter
await engine.initEncounter("session_123", patientProfile);

// 2. Append dictation (mutates and versions the draft)
await engine.processCdsl("session_123", "#vital temp 38.2 || #observation denies Chest Pain");

// 3. Finalize and Sign (renders the note immutable)
const record = await engine.signEncounter("session_123", "Dr. Smith");
```

---

## 4. Decoupled Storage Architecture

The clinical backend depends on 8 storage-agnostic repository interfaces defined in [interfaces.ts](file:///home/denny/lu/prototype/stateful_mcp/packages/clinical/src/store/interfaces.ts):

1. **`ParserProfileStore`**: Syntax profile configurations.
2. **`ParserConceptDefaultStore`**: Defaults mapping registry linking concepts to schemas.
3. **`CalibrationStore`**: Queue for auditing and logging unmapped slang words.
4. **`ClinicalProseTemplateStore`**: Narrative prose template generator configurations.
5. **`SignedSoapNoteStore`**: Long-term legal read-only SOAP archive.
6. **`AdministrativeStore`**: Facility & Personnel directories.
7. **`JurisdictionalDisplayStore`**: Preferred display names by region.
8. **`StopWordStore`**: Filter words compiler.

An in-memory fallback implementation of all stores is provided in [memory-clinical-store.ts](file:///home/denny/lu/prototype/stateful_mcp/packages/clinical/src/store/memory-clinical-store.ts).

---

## 5. Concepts Seed Data

Seeds for standardized vocabularies are loaded from `seed/` using the loader utility:
```typescript
import { seedClinicalData } from "@stateful-mcp/clinical";

// Loads LOINC, SNOMED-CT, RxNorm, and UCUM units into your dictionary store
await seedClinicalData(dictionaryStore);
```
