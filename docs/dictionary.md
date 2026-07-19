# Dictionary Service Reference Guide

The Dictionary Service is an ontology normalization engine. It translates colloquial user terminology, shorthand, and abbreviations into standardized database coordinate keys before they enter queries or forms.

---

## 1. Coordinates and Resolution

Concepts inside the dictionary are addressed using coordinate identifiers:
* Format: `[NAMESPACE]::[CONCEPT_CODE]` (e.g. `CLINICAL::MYOCARDIAL_INFARCTION`).
* Calling `dictionary_resolve(term)` processes matches against defined concepts and expression aliases, returning the formal coordinate identifier.

---

## 2. Alias Synonyms & Score Boosting

* **Regular Expression Synonyms**: Dictionary expressions can match terms using exact strings or custom regex patterns.
  * **Engine**: Evaluated using the standard **JavaScript (Node.js) `RegExp` engine**.
  * **Syntax Rules**:
    * **Do NOT wrap** patterns in forward slashes `/.../`.
    * **Do NOT append** flags (like `/i` or `/g`) inside the pattern string.
    * Use the dedicated `isCaseInsensitive` boolean property to toggle case sensitivity (adds the `i` flag under the hood).
    * Supports standard PCRE features: word boundaries `\b`, anchors `^`/`$`, character classes `[a-z]`, and capture groups.
  * **Example**: E.g. raw pattern `^amox(y)?$` combined with `isCaseInsensitive: true`.
* **Score Boosting**: When multiple expressions match a search query, the service calculates weights:
  * Positive feedback (e.g. selection) increases the expression's weight score.
  * Loser expressions in the same candidate match set decay over time.
  * The resolver prioritizes candidates with higher weight scores.

---

## 3. Scope Hierarchy

Ontology resolution supports multiple administrative scopes:
1. **User Scope**: User-specific shorthand (e.g. customized abbreviations). Takes highest precedence.
2. **Workspace Scope**: Shorthand shared across a team workspace. Shadows global definitions.
3. **Global Scope**: Default, organization-wide medical/business vocabularies.
