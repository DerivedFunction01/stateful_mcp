import * as fs from "fs/promises";
import * as path from "path";

// Embedded default schemas & mock datasets if no configuration file exists
const DEFAULT_FILTER_CONFIG = {
  tools: [
    {
      toolName: "browse_catalog",
      primary_table: "items",
      available_tables: ["items", "reviews"],
      table_schemas: {
        items: {
          filterable_properties: ["name", "sku", "price", "category", "brand", "popularity_index", "inventory"],
          operators: ["eq", "neq", "gt", "geq", "lt", "leq", "like", "not_like", "in_set", "not_in_set", "between"],
          groupable_columns: ["category", "brand"],
          aggregations: ["count", "sum", "avg", "min", "max", "count_distinct"],
          result_shape: "items",
          max_results: 100,
          mock_dataset: [
            { id: "item_1", name: "Premium Wireless Headphones", sku: "HP-100", price: 299.99, category: "electronics", brand: "Sony", popularity_index: 8.5, inventory: 42 },
            { id: "item_2", name: "Classic Running Shoes", sku: "SH-200", price: 89.99, category: "apparel", brand: "Nike", popularity_index: 9.1, inventory: 120 },
            { id: "item_3", name: "Waterproof Hiking Boots", sku: "SH-300", price: 149.99, category: "apparel", brand: "Columbia", popularity_index: 7.9, inventory: 15 },
            { id: "item_4", name: "Smart OLED TV 55 Inch", sku: "TV-400", price: 1299.99, category: "electronics", brand: "LG", popularity_index: 8.9, inventory: 8 },
            { id: "item_5", name: "Ergonomic Office Chair", sku: "CH-500", price: 249.99, category: "furniture", brand: "Steelcase", popularity_index: 8.2, inventory: 23 }
          ]
        },
        reviews: {
          filterable_properties: ["item_id", "rating", "reviewer_id"],
          operators: ["eq", "gt", "lt"],
          result_shape: "reviews",
          mock_dataset: [
            { id: "rev_1", item_id: "item_1", rating: 5, reviewer_id: "user_a" },
            { id: "rev_2", item_id: "item_1", rating: 4, reviewer_id: "user_b" },
            { id: "rev_3", item_id: "item_2", rating: 5, reviewer_id: "user_c" }
          ]
        }
      }
    },
    {
      toolName: "medical_diagnosis",
      primary_table: "diagnoses",
      available_tables: ["diagnoses"],
      table_schemas: {
        diagnoses: {
          filterable_properties: ["diagnosis_code", "medication_code", "age", "severity"],
          operators: ["eq", "neq", "gt", "geq", "lt", "leq", "in_set", "not_in_set"],
          result_shape: "diagnoses",
          mock_dataset: [
            { id: "diag_1", diagnosis_code: "HTN_HIGH_BP", medication_code: "MEDICATION_X_CODE", age: 45, severity: "moderate" },
            { id: "diag_2", diagnosis_code: "HTN_HIGH_BP", medication_code: "MEDICATION_Y_CODE", age: 52, severity: "severe" },
            { id: "diag_3", diagnosis_code: "DIABETES_2", medication_code: "INSULIN_A", age: 39, severity: "mild" },
            { id: "diag_4", diagnosis_code: "HTN_HIGH_BP", medication_code: "MEDICATION_X_CODE", age: 31, severity: "mild" }
          ]
        }
      }
    }
  ]
};

const DEFAULT_DICTIONARY_CONFIG = {
  namespaces: [
    { code: "SNOMED", isPublic: true, isExternalPrivate: false },
    { code: "CUSTOM", isPublic: false, isExternalPrivate: true, externalPrivateSource: "HOSPITAL_A" }
  ],
  concepts: [
    { id: "concept_htn", namespaceCode: "SNOMED", standardCode: "38341003", display: "Hypertension" },
    { id: "concept_med_x", namespaceCode: "CUSTOM", standardCode: "MEDICATION_X_CODE", display: "Medication X" }
  ],
  relations: [
    { id: "rel_1", conceptId: "concept_htn", linkedId: "concept_htn", relationshipType: "EQUIVALENT", active: true }
  ],
  expressions: [
    {
      id: "expr_1",
      term: "the usual thing",
      regexPattern: "the usual thing|usual bp issue",
      isCaseInsensitive: true,
      targetAssignment: "MAIN_TERM",
      conceptId: "concept_htn",
      priorityWeight: 1,
      active: true,
      context: { tags: ["diagnosis"] }
    },
    {
      id: "expr_2",
      term: "blue pill",
      regexPattern: "blue pill|little blue tablet",
      isCaseInsensitive: true,
      targetAssignment: "MAIN_TERM",
      conceptId: "concept_med_x",
      priorityWeight: 1,
      active: true,
      context: { tags: ["medication"] }
    }
  ]
};

export async function loadFilterConfig(workspaceRoot: string): Promise<any> {
  const configPath = path.join(workspaceRoot, "filter.config.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    // Resolve any file paths or APIs specified in the config
    if (parsed.tools) {
      for (const tool of parsed.tools) {
        if (tool.tables) {
          tool.table_schemas = tool.table_schemas || {};
          tool.available_tables = Object.keys(tool.tables);
          
          for (const [tableName, source] of Object.entries<any>(tool.tables)) {
            let schema: any = {};
            let mock: any[] = [];

            if (source.schemaPath) {
              const schemaRaw = await fs.readFile(path.resolve(workspaceRoot, source.schemaPath), "utf-8");
              schema = JSON.parse(schemaRaw);
            } else if (source.apiUrl) {
              const res = await fetch(source.apiUrl);
              schema = await res.json();
            }

            if (source.mockPath) {
              const mockRaw = await fs.readFile(path.resolve(workspaceRoot, source.mockPath), "utf-8");
              mock = JSON.parse(mockRaw);
            } else if (source.mockUrl) {
              const res = await fetch(source.mockUrl);
              mock = (await res.json()) as any[];
            }

            tool.table_schemas[tableName] = {
              ...schema,
              mock_dataset: mock
            };
          }
        }
      }
    }
    return parsed;
  } catch (err) {
    // Config not found or invalid, return default
    return DEFAULT_FILTER_CONFIG;
  }
}

export async function loadDictionaryConfig(workspaceRoot: string): Promise<any> {
  const configPath = path.join(workspaceRoot, "dictionary.config.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);

    if (parsed.conceptsSource) {
      if (parsed.conceptsSource.filePath) {
        const fileRaw = await fs.readFile(path.resolve(workspaceRoot, parsed.conceptsSource.filePath), "utf-8");
        parsed.concepts = JSON.parse(fileRaw);
      } else if (parsed.conceptsSource.apiUrl) {
        const res = await fetch(parsed.conceptsSource.apiUrl);
        parsed.concepts = await res.json();
      }
    }

    if (parsed.expressionsSource) {
      if (parsed.expressionsSource.filePath) {
        const fileRaw = await fs.readFile(path.resolve(workspaceRoot, parsed.expressionsSource.filePath), "utf-8");
        parsed.expressions = JSON.parse(fileRaw);
      } else if (parsed.expressionsSource.apiUrl) {
        const res = await fetch(parsed.expressionsSource.apiUrl);
        parsed.expressions = await res.json();
      }
    }

    return {
      namespaces: parsed.namespaces || DEFAULT_DICTIONARY_CONFIG.namespaces,
      concepts: parsed.concepts || DEFAULT_DICTIONARY_CONFIG.concepts,
      relations: parsed.relations || DEFAULT_DICTIONARY_CONFIG.relations,
      expressions: parsed.expressions || DEFAULT_DICTIONARY_CONFIG.expressions
    };
  } catch (err) {
    return DEFAULT_DICTIONARY_CONFIG;
  }
}
