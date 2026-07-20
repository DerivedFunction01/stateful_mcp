# Dictionary MCP Service

The Dictionary MCP Service is a terminology mapping and concept resolution system. It matches shorthand user terms or aliases (e.g., `"heart attack"`) to canonical database codes or standard terminologies (e.g., `SNOMED::I21.9`) using weighted, context-aware resolution algorithms.

---

## Core Architectural Concepts

*   **Concepts**: Canonical code coordinates consisting of a namespace code, standard code, and display name.
*   **Relations**: Semantic links connecting different concepts (e.g., `CUSTOM::heart_attack` mapped as `EQUIVALENT` to `SNOMED::I21.9`).
*   **Expressions**: Shortcut alias rules. They bind user shorthand words or regex patterns to specific concept coordinates.
*   **Workspaces & Tags**: Configurable scopes and classifications that partition dictionaries by user/department.
*   **Weighted Multi-Backend Resolver**: Dynamically ranks and boosts search results based on selection feedback (winner reinforcement and loser decay).

---

## Typical LLM Interaction Walkthrough

When an LLM agent assists a user with clinical or domain-specific terminology mapping, it utilizes the exposed MCP tools in a modular, step-by-step fashion.

```
  [User Request]
        │
        ▼
┌───────────────┐        No
│Concept Exist? │────────────────────────────────┐
└───────────────┘                                │
        │ Yes                                    ▼
        │                              ┌──────────────────┐
        ▼                              │   add_concept    │
┌───────────────┐                      └──────────────────┘
│  Expression   │                                │
│    Exists?    │                                ▼
└───────────────┘                      ┌──────────────────┐
        │ No                           │   add_relation   │
        ▼                              └──────────────────┘
┌──────────────────┐                             │
│  add_expression  │◄────────────────────────────┘
└──────────────────┘
```

### 1. Registering Custom Terminology
*   **User Action**: The user asks to map a new local abbreviation to a standard code (e.g., *"Map the local term 'pump failure' to SNOMED code I21.9"*).
*   **LLM Decision**: 
    1.  **Create Concept**: Call `dictionary_add_concept` to register a local custom concept for the new term.
    2.  **Define Link**: Call `dictionary_add_relation` to link this new local concept to `SNOMED::I21.9` as an `EQUIVALENT`.
    3.  **Map Expression**: Call `dictionary_add_expression` to register `"pump failure"` as an alias mapping to the local concept.

### 2. Auto-Resolving Shorthands
*   **User Action**: The user inputs raw unstructured text (e.g., *"Patient suffered from a pump failure last night"*).
*   **LLM Decision**: 
    1.  **Resolve Term**: Call `dictionary_resolve` with `"pump failure"`.
    2.  **Translate Code**: The MCP server uses the active backend weights to score matching candidates, returning the canonical concept.
    3.  **LLM Output**: The LLM presents the structured clinical terminology to the user.
    4.  **Feedback**: The system automatically rewards the winning backend's weight, optimizing future autocomplete scores.
