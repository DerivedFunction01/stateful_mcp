# Object Service Reference Guide

The Object Service manages structured JSON documents (e.g. order forms, medical prescriptions, patient SOAP notes) with stateful delta tracking and strict validation guards.

---

## 1. Stateful Object Lifecycle

* **`object_init`**: Instantiates a new empty object or pre-populates it with initial data matching a registered schema.
* **`object_patch`**: Applies a sparse JSON patch delta on an existing object ID, returning a new immutable checkpoint.
* **`object_validate`**: Runs the object through the Ajv compiler and cross-field constraint validator, returning a structured list of errors and warnings.
* **`object_resolve`**: Finalizes the object. Resolves recursive lazy reference links (e.g. referencing other entities or variables) and returns the complete, resolved document.

---

## 2. Validation & Schema Guards

* **JSON Schema validation**: Checked via Ajv at each checkpoint.
* **Cross-Field constraints**: Custom rules like ensuring `start_date < end_date` or verifying ranges.
* **Cycle detection**: Ensures lazy reference links do not form recursive loops.
* **Schema guard**: Comparing two object versions with differing schemas throws a `SCHEMA_MISMATCH` error.

---

## 3. Template Loading (`from_saved`)

To reduce token overhead on repeated document creation, the Object Service supports loading saved templates:
* Templates can be saved to persistent storage.
* Call `object_from_saved(template_id)` to clone a pre-populated baseline state, allowing the LLM to only patch the specific fields that differ for the current transaction.
