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

### Zero-Bias Internationalization (i18n) & Custom Aliases
Clinicians can configure the parser with a custom `ParserSyntaxProfile` containing:
* `tagToken`: Custom prefix (e.g., `$` instead of `#`).
* `tagMappings`: Maps custom or translated tag names to the canonical schema target keys.
* `attributeRules`: Regex patterns mapping localized terms to enums (e.g., matching `"niega"` $\rightarrow$ `certainty: "refuted"`, or `"grave"` $\rightarrow$ `severity: "severe"`).
* `schemaNamespaces`: Maps schema keys or names to prioritized/allowed namespaces (e.g. `observation` mapped to `["SNOMED", "ICD-10"]`).
* `termTokenizer`: Tokenizer to parse direct database/dictionary lookup (e.g., `::` mapping `LOINC::8310-5`).

---

## 2. Core CDSL Compiler Features

### Anchor Concepts & Entropy Reduction
Every target schema is anchored by **one or two key parameters** ("the main term" or anchor concept). Identifying this anchor reduces the entropy of the remaining text in the segment, transforming unstructured prose into highly predictable slots:

1. **Vitals (`VitalsMeasurementEvent`)**
   * **Key Parameter**: `vitalType` (the primary vital sign concept, e.g. LOINC standard code for temperature, heart rate, or blood pressure).
   * **Entropy Resolution**: Resolving the vital sign narrows the remaining tokens down to predictable numeric quantities, intervals, and unit structures.
2. **Observations (`ObservationEvent`)**
   * **Key Parameter**: `concept` (the primary symptom or diagnosis, e.g. SNOMED standard code for pain, cough, or dyspnea).
   * **Entropy Resolution**: Resolving the diagnosis reduces the remainder of the text to descriptors indicating severity scores (e.g. `4/10`), certainties (e.g. `denies`), or clinical status.
3. **Medications (`MedicationOrderObject`)**
   * **Key Parameter**: `medication` (the drug name/ingredient concept, e.g. RxNorm standard code for chemical substances or clinical drugs).
   * **Entropy Resolution**: Resolving the drug ingredient limits the remaining terms to route codes, dosage measurements, and cadence/frequency directives (e.g. `oral TID`).

### Tagless Fallback Schema Guessing
When the clinician inputs dictation segments without explicit tag prefixes (e.g. `temp 38 Cel` instead of `#vital temp 38 Cel`), the parser dynamically infers the target schema. 

Instead of relying on the anchor concept residing at a fixed position (like the first word), the parser queries candidate terms in the segment against the syntax profile's configured `schemaNamespaces` and `ParserConceptDefaultStore`. Once an anchor concept is resolved, its target schema is adopted to parse the rest of the low-entropy text:
* **LOINC** $\rightarrow$ `VitalsMeasurementEvent`
* **RxNorm** $\rightarrow$ `MedicationOrderObject`
* **SNOMED / Custom** $\rightarrow$ `ObservationEvent`

### Language Neutrality & Zero-Bias Parsing
> [!IMPORTANT]
> **Strict Coding Guideline**: Under no circumstances should English-centric matching (e.g., hardcoded substring parsing or English regexes like `hr`, `day`, `hours`) be assumed within helper parsers. 
> All unit translations, comparison operators (e.g., `aprox`, `alrededor de`), and enums must be resolved dynamically by consulting the parser syntax profile's `attributeRules` and `evaluatorRules`.

* **`MeasurementHelper.parse`**: Dynamically compiles operator regular expressions from the profile's configuration (e.g. resolving localized operator words like `aprox` or `alrededor de` preceding a number) and resolves localized unit tokens to canonical codes using attribute rules.
* **`TimeHelper.parse`**: Scans the syntax profile's rules to map localized unit names (e.g., Spanish `"horas"` or `"dias"`) to standard `TimePrecisionLevel` enums.
* **`VitalsHelper.findBloodPressure`**: Resolves capture groups for systolic, diastolic, and unit parameters dynamically via matched evaluator rules.
* **`ObservationHelper.parseSeverity`**: Evaluates and normalizes severity scores (e.g., `4/10` or `7 out of 10`) on a standard scale.

---

## 3. Stateful Clinical Engine (`ClinicalEngine`)

The `ClinicalEngine` coordinates the parser and the stateful core services:
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


# 5. The Philosophy of "Clinical Freedom"
The true goal of CDSL is the total separation of data structure from user expression, returning autonomy to the physician while guaranteeing clean data to the infrastructure.

* **Personalization Stack**: Clinicians are no longer forced to bow to the rigid, inefficient user interfaces of host institutions. A doctor can take their personal_dictionary file from facility to facility.
* **Two-Stage Resolution Middleware**: If Dr. A types | SOB; 4/10 | and Dr. B types | winded; 4/10 |, the translation engine resolves these high-entropy personal styles to a single hospital canonical code (e.g., ICD-10: R06.02).
* **Interoperable Multilingualism**: Because the engine captures a normalized data state rather than flat text, a note documented using Japanese clinical abbreviations can be instantly rendered on-the-fly in English, Spanish, or a highly technical billing view using a reverse dictionary lookup.