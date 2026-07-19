import { test, expect, describe, afterAll, beforeAll } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { DataFrameQueryEngine } from "../src/adapters/engines/dataframe-engine";

const TEST_DIR = path.resolve(process.cwd(), "temp_test_df");
const CSV_FILE = path.join(TEST_DIR, "inventory.csv");

describe("DataFrame Query Engine (Pandas + DuckDB)", () => {
  let engine: DataFrameQueryEngine;

  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    
    // Create a simple inventory CSV dataset
    const csvContent = [
      "item_id,name,category,price,qty",
      "1,aspirin,pharmacy,4.99,100",
      "2,ibuprofen,pharmacy,5.49,80",
      "3,bandage,first_aid,2.99,150",
      "4,thermometer,devices,12.99,30",
      "5,vitamin_c,supplements,9.99,0"
    ].join("\n");
    
    await fs.writeFile(CSV_FILE, csvContent, "utf-8");
  });

  afterAll(async () => {
    if (engine) {
      engine.destroy();
    }
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (_) {}
  });

  test("Load and query CSV DataFrame using DuckDB", async () => {
    engine = new DataFrameQueryEngine(CSV_FILE, "inventory", "./.venv/bin/python3");
    await engine.loadDataFrame();

    // 1. Simple Select
    const allRows = (await engine.execute("inventory", {
      filters: []
    })) as any[];
    expect(allRows.length).toBe(5);
    expect(allRows[0].name).toBe("aspirin");

    // 2. Filter condition: qty > 50
    const highQty = (await engine.execute("inventory", {
      filters: [
        { property: "qty", operator: "gt", value: 50 }
      ]
    })) as any[];
    expect(highQty.length).toBe(3); // aspirin (100), ibuprofen (80), bandage (150)

    // 3. Filter condition: category = 'pharmacy' AND qty < 90
    const pharmacyLowQty = (await engine.execute("inventory", {
      filters: [
        { property: "category", operator: "eq", value: "pharmacy" },
        { property: "qty", operator: "lt", value: 90 }
      ]
    })) as any[];
    expect(pharmacyLowQty.length).toBe(1);
    expect(pharmacyLowQty[0].name).toBe("ibuprofen");

    // 4. Aggregations: count, max price
    const summary = (await engine.execute("inventory", {
      filters: [],
      aggregations: [
        { function: "count", property: "", alias: "total_items" },
        { function: "max", property: "price", alias: "max_price" }
      ]
    })) as any[];
    expect(summary.length).toBe(1);
    expect(summary[0]["count_star()"] || summary[0]["COUNT(*)"]).toBe(5);
  });
});
