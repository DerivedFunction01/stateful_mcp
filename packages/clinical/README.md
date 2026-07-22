# `@stateful-mcp/clinical` — Clinical IDE & CDSL Backend Engine

This package provides the core backend parsing, vocabulary anchoring, and stateful SOAP Note engine for the Clinical IDE. It is designed to run offline or in serverless environments, decoupling clinical business rules from storage adapters (Postgres, SQLite, IndexedDB, etc.) through strict Dependency Inversion.

---

## The Philosophy: Beyond Dropdown Fatigue & Stochastic LLMs

EHR (Electronic Health Record) systems suffer from **dropdown fatigue**—stacking checkboxes and nested menus onto legacy databases. Conversely, generative AI/LLM transcription introduces **semantic noise, liability, and liability** due to hallucinations.

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

Clinicians can configure the parser with a custom `ParserSyntaxProfile` containing multilingual tag aliases, localized attribute mappings, and namespace priorities.

---

## 2. Anchor Concepts & Entropy Reduction

Every target schema is anchored by **one or two key parameters** ("the main term"). Resolving this anchor narrows the remaining tokens into predictable slots:

1. **Vitals**: `vitalType` (e.g. LOINC code for temperature, heart rate)
2. **Observations**: `concept` (e.g. SNOMED code for pain, cough)
3. **Medications**: `medication` (e.g. RxNorm code for drug ingredient)

When clinicians omit explicit tags (e.g. `temp 38 Cel` instead of `#vital temp 38 Cel`), the parser dynamically infers the target schema by querying candidate terms against configured namespaces and concept defaults.

---

## 3. Stateful Clinical Engine (`ClinicalEngine`)

The `ClinicalEngine` coordinates the parser and stateful core services:

* **Encounter Life Cycle**: Initializes draft notes (`initEncounter`), appends CDSL parsed events (`processCdsl`), and locks notes via electronic signature (`signEncounter`).
* **Git-like VCS Compaction**: Mutates SOAP Note objects on sub-paths (`set`), compiling a transaction history of structural revisions.

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

A complete relational SQL database representation (PostgreSQL target) of these interfaces is defined in [seed/schema.sql](file:///home/denny/lu/prototype/stateful_mcp/packages/clinical/seed/schema.sql), showing exactly how they map to relational tables and schemas for external adapter integration.

---

## 5. The Philosophy of "Clinical Freedom"

The true goal of CDSL is the total separation of data structure from user expression, returning autonomy to the physician while guaranteeing clean data to the infrastructure.

* **Personalization Stack**: Clinicians are no longer forced to bow to the rigid, inefficient user interfaces of host institutions. A doctor can take their personal_dictionary file from facility to facility.
* **Two-Stage Resolution Middleware**: If Dr. A types `| SOB; 4/10 |` and Dr. B types `| winded; 4/10 |`, the translation engine resolves these high-entropy personal styles to a single hospital canonical code (e.g., ICD-10: R06.02).
* **Interoperable Multilingualism**: Because the engine captures a normalized data state rather than flat text, a note documented using Japanese clinical abbreviations can be instantly rendered on-the-fly in English, Spanish, or a highly technical billing view using a reverse dictionary lookup.

---

For implementation architecture, coding rules, and the separation of concerns plan, see [DEVELOPMENT.md](DEVELOPMENT.md).
