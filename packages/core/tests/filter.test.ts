import * as fs from "fs/promises";
import * as path from "path";
import { MemoryQueryEngine } from "../src/adapters/engines/memory-query";
import { PgQueryEngine } from "../src/adapters/engines/pg-query";
import { SqliteQueryEngine } from "../src/adapters/engines/sqlite-query";
import {
	MemoryPersistentFilterStore,
	MemorySessionFilterStore,
} from "../src/adapters/storage/memory-repo";
import { SqliteFilterStore } from "../src/adapters/storage/sqlite-repo";
import { loadMiddlewareConfig } from "../src/config/loader";
import type { TableSchema } from "../src/config/types";
import { validateMiddlewareConfig } from "../src/config/validator";
import { FilterStore } from "../src/middleware/filter/store";
import type { FilterCondition } from "../src/middleware/filter/types";
import { compilePipelineToSQL } from "../src/translation/compiler";
import { executePipeline } from "../src/translation/pipeline";
import { validateTableTranslation } from "../src/translation/validator";

export async function runFilterTests() {
	console.log("🚀 Starting Filter Service tests...\n");

	const workspaceRoot = path.resolve(process.cwd(), "..");

	// Setup sample configs & files for testing loader and validator
	const tempConfigDir = path.join(workspaceRoot, "config");
	await fs.mkdir(tempConfigDir, { recursive: true });

	const dummyToolsConfig = {
		tools: {
			browse_catalog: {
				schema: {
					_type: "file",
					path: "./config/tools/browse_catalog.schema.json",
				},
				engine: { _type: "adapter", name: "memory-engine" },
			},
		},
	};

	const dummyStorageConfig = {
		version: 1,
		filter_session_state: { _type: "adapter", name: "memory" },
		filter_persistent_state: {
			global: { _type: "adapter", name: "memory" },
			user: { _type: "adapter", name: "memory" },
		},
		object_session_state: { _type: "adapter", name: "memory" },
		object_persistent_state: {
			global: { _type: "adapter", name: "memory" },
			user: { _type: "adapter", name: "memory" },
		},
		dictionary_state: { _type: "adapter", name: "memory" },
		dictionary_resolver: { _type: "adapter", name: "memory" },
	};

	await fs.writeFile(
		path.join(tempConfigDir, "tools.config.json"),
		JSON.stringify(dummyToolsConfig, null, 2),
	);
	await fs.writeFile(
		path.join(tempConfigDir, "storage.config.json"),
		JSON.stringify(dummyStorageConfig, null, 2),
	);

	// ─── TEST CASE 1: Config Loading and Validation ───
	console.log("🧪 Test Case 1: Config Loading and Validation");
	const config = await loadMiddlewareConfig(workspaceRoot);
	validateMiddlewareConfig(config);
	console.log("✓ Config loaded and validated successfully.");

	// Test environment variable substitution
	process.env.TEST_DB_PATH = "./test.db";
	const locatorWithEnv = {
		_type: "adapter",
		name: "sqlite",
		options: { path: "env:TEST_DB_PATH" },
	};
	const resolveEnvResult: any =
		require("../src/config/loader").substituteEnvVars(locatorWithEnv);
	if (resolveEnvResult.options.path !== "./test.db") {
		throw new Error(
			`Env var substitution failed. Got: ${JSON.stringify(resolveEnvResult)}`,
		);
	}
	console.log("✓ Environment variable substitution works correctly.");

	// ─── TEST CASE 2: Memory Storage Repositories ───
	console.log("\n🧪 Test Case 2: Memory Storage Repositories");
	const sessionStore = new MemorySessionFilterStore();
	const persistentStore = new MemoryPersistentFilterStore();

	const mockFilterState = {
		filterId: "f1",
		rules: [{ property: "price", operator: "lt" as const, value: 100 }],
		createdAt: new Date().toISOString(),
	};

	await sessionStore.set("session_123", "f1", mockFilterState);
	const retrievedSession = await sessionStore.get("session_123", "f1");
	if (!retrievedSession || retrievedSession.rules[0]?.value !== 100) {
		throw new Error("Session Filter Store get/set failed");
	}

	const persistedState = {
		...mockFilterState,
		tags: ["test"],
		description: "test filter",
		schema_snapshot: "{}",
	};
	await persistentStore.set("f1", persistedState, {
		level: "user",
		userId: "u1",
	});
	const retrievedPersisted = await persistentStore.get("f1", {
		level: "user",
		userId: "u1",
	});
	if (!retrievedPersisted || retrievedPersisted.description !== "test filter") {
		throw new Error("Persistent Filter Store get/set failed");
	}
	console.log("✓ Memory Session & Persistent repositories function correctly.");

	// ─── TEST CASE 3: Memory Query Engine ───
	console.log("\n🧪 Test Case 3: Memory Query Engine");
	const sampleItems = [
		{ id: 1, name: "Socks", price: 10, category: "apparel" },
		{ id: 2, name: "Shoes", price: 80, category: "apparel" },
		{ id: 3, name: "Laptop", price: 1000, category: "electronics" },
	];

	const engine = new MemoryQueryEngine({ items: sampleItems });
	const queryResult = await engine.execute("items", {
		filters: [
			{ property: "category", operator: "eq", value: "apparel" },
			{ property: "price", operator: "gt", value: 15 },
		],
	});

	if (queryResult.length !== 1 || (queryResult[0] as any).name !== "Shoes") {
		throw new Error(
			`QueryEngine execution failed. Got: ${JSON.stringify(queryResult)}`,
		);
	}
	console.log("✓ Memory Query Engine filtering worked correctly.");

	// ─── TEST CASE 4: FilterStore Coordinator ───
	console.log("\n🧪 Test Case 4: FilterStore Coordinator");
	const toolSchemas = new Map<string, Record<string, TableSchema>>();
	toolSchemas.set("browse_catalog", {
		items: {
			filterable_properties: ["price", "category"],
			operators: ["eq", "neq", "lt", "gt", "like", "between"],
			mock_dataset: [{ price: 100, category: "apparel" }],
		},
	});

	const pinnedSchemas = new Map<string, TableSchema>();
	const filterStore = new FilterStore(
		sessionStore,
		persistentStore,
		toolSchemas,
		pinnedSchemas,
	);

	// Initialize and build a hierarchical chain
	const fInit = await filterStore.init(
		"session_123",
		"browse_catalog",
		"items",
	);
	const fAdded1 = await filterStore.add(
		fInit,
		[{ property: "category", operator: "eq", value: "apparel" }],
		"session_123",
	);

	// Test invalid operator 'like' on numeric field 'price'
	try {
		await filterStore.add(
			fAdded1,
			[{ property: "price", operator: "like", value: "cheap" }],
			"session_123",
		);
		throw new Error(
			"Should have thrown error on numeric column with 'like' operator",
		);
	} catch (err: any) {
		if (err.message.includes("is not allowed on numeric property")) {
			console.log(
				"✓ Successfully caught numeric property operator constraint check.",
			);
		} else {
			throw err;
		}
	}

	// Test invalid operator 'between' on string field 'category'
	try {
		await filterStore.add(
			fAdded1,
			[{ property: "category", operator: "between", value: [10, 20] }],
			"session_123",
		);
		throw new Error(
			"Should have thrown error on string column with 'between' operator",
		);
	} catch (err: any) {
		if (err.message.includes("is not allowed on non-numeric property")) {
			console.log(
				"✓ Successfully caught non-numeric property operator constraint check.",
			);
		} else {
			throw err;
		}
	}

	const fAdded2 = await filterStore.add(
		fAdded1,
		[{ property: "price", operator: "lt", value: 100 }],
		"session_123",
	);

	const rulesChain = await filterStore.getFilterRules(fAdded2, "session_123");
	if (rulesChain.length !== 2) {
		throw new Error(
			`Hierarchy rule traversal failed. Rules count: ${rulesChain.length}`,
		);
	}
	console.log("✓ Filter hierarchy creation and rule traversal works.");

	// Test removeRule
	const fRemoved = await filterStore.removeRule(
		fAdded2,
		"price",
		"lt",
		"session_123",
	);
	const rulesAfterRemoval = await filterStore.getFilterRules(
		fRemoved,
		"session_123",
	);
	if (
		rulesAfterRemoval.length !== 1 ||
		rulesAfterRemoval[0]?.property !== "category"
	) {
		throw new Error("removeRule failed to remove price filter rule");
	}
	console.log(
		"✓ FilterStore removeRule successfully removed price constraint.",
	);

	// Compress
	const compressedId = await filterStore.compress(fAdded2, "session_123");
	const compressedRules = await filterStore.getFilterRules(
		compressedId,
		"session_123",
	);
	const compFilter = await filterStore.getFilter(compressedId, "session_123");
	if (compressedRules.length !== 2 || compFilter?.parentFilterId !== null) {
		throw new Error("Filter chain compression failed");
	}
	console.log("✓ Filter chain compression successfully flattened rules.");

	// Combine Set Ops (Intersection)
	const fApparel = await filterStore.init(
		"session_123",
		"browse_catalog",
		"items",
	);
	const fApparelAdd = await filterStore.add(
		fApparel,
		[{ property: "category", operator: "eq", value: "apparel" }],
		"session_123",
	);

	const fExpensive = await filterStore.init(
		"session_123",
		"browse_catalog",
		"items",
	);
	const fExpensiveAdd = await filterStore.add(
		fExpensive,
		[{ property: "price", operator: "gt", value: 50 }],
		"session_123",
	);

	const combinedId = await filterStore.combine(
		"intersection",
		[fApparelAdd, fExpensiveAdd],
		"session_123",
	);

	const resolvedCombinedRows = await filterStore.resolveRows(
		combinedId,
		"session_123",
		undefined,
		async () => engine,
	);

	if (
		resolvedCombinedRows.length !== 1 ||
		resolvedCombinedRows[0].name !== "Shoes"
	) {
		throw new Error(
			`Combined filter execution (intersection) failed. Got: ${JSON.stringify(resolvedCombinedRows)}`,
		);
	}
	console.log(
		"✓ Combined filter execution (set operations) resolved correctly.",
	);

	// ─── TEST CASE 5: Relational SQL Adapters ───
	console.log("\n🧪 Test Case 5: Relational SQL Adapters");

	const sqliteEngine = new SqliteQueryEngine(":memory:");
	sqliteEngine["db"].run(
		"CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, price REAL, category TEXT)",
	);
	sqliteEngine["db"].run(
		"INSERT INTO items (name, price, category) VALUES ('Socks', 10, 'apparel')",
	);
	sqliteEngine["db"].run(
		"INSERT INTO items (name, price, category) VALUES ('Shoes', 80, 'apparel')",
	);
	sqliteEngine["db"].run(
		"INSERT INTO items (name, price, category) VALUES ('Laptop', 1000, 'electronics')",
	);

	const compiled = sqliteEngine.compile("items", {
		filters: [
			{ property: "category", operator: "eq", value: "apparel" },
			{ property: "price", operator: "gt", value: 15 },
		],
	});

	if (
		!compiled.sql.includes("WHERE `category` = ? AND `price` > ?") ||
		compiled.params[0] !== "apparel" ||
		compiled.params[1] !== 15
	) {
		throw new Error(
			`SqliteQueryEngine compilation failed: ${JSON.stringify(compiled)}`,
		);
	}
	console.log("✓ SQLite Query Compiler output parameterized query correctly.");

	const sqliteResults = await sqliteEngine.execute("items", {
		filters: [
			{ property: "category", operator: "eq", value: "apparel" },
			{ property: "price", operator: "gt", value: 15 },
		],
	});
	if (
		sqliteResults.length !== 1 ||
		(sqliteResults[0] as any).name !== "Shoes"
	) {
		throw new Error(
			`SQLite Query Engine execution failed. Got: ${JSON.stringify(sqliteResults)}`,
		);
	}
	console.log("✓ SQLite Query Engine executed and filtered correctly.");

	const sqliteStore = new SqliteFilterStore(":memory:");
	await sqliteStore.set("sess_sql", "f_sql", {
		filterId: "f_sql",
		rules: [{ property: "price", operator: "lt", value: 100 }],
		createdAt: new Date().toISOString(),
	});

	const sqliteRetrieved = await sqliteStore.get("sess_sql", "f_sql");
	if (!sqliteRetrieved || sqliteRetrieved.rules[0]?.value !== 100) {
		throw new Error("SqliteFilterStore session get/set failed");
	}
	console.log("✓ SqliteFilterStore session persistence works.");

	await sqliteStore.set(
		"f_sql",
		{
			filterId: "f_sql",
			rules: [{ property: "price", operator: "lt", value: 100 }],
			createdAt: new Date().toISOString(),
			tags: ["persistent"],
			description: "sqlite persistent filter",
			schema_snapshot: "{}",
		},
		{ level: "user", userId: "u_sql" },
	);

	const sqliteRetrievedPersisted = await sqliteStore.get("f_sql", {
		level: "user",
		userId: "u_sql",
	});
	if (
		!sqliteRetrievedPersisted ||
		sqliteRetrievedPersisted.description !== "sqlite persistent filter"
	) {
		throw new Error("SqliteFilterStore persistent get/set failed");
	}
	console.log("✓ SqliteFilterStore persistent storage works.");

	const pgEngine = new PgQueryEngine("postgresql://localhost:5432/postgres");
	const pgCompiled = pgEngine.compile("items", {
		filters: [
			{ property: "category", operator: "eq", value: "apparel" },
			{ property: "price", operator: "gt", value: 15 },
		],
	});
	if (
		!pgCompiled.sql.includes('WHERE "category" = $1 AND "price" > $2') ||
		pgCompiled.params[0] !== "apparel" ||
		pgCompiled.params[1] !== 15
	) {
		throw new Error(
			`PgQueryEngine compilation failed: ${JSON.stringify(pgCompiled)}`,
		);
	}
	console.log(
		"✓ Postgres Query Compiler generated parameter indexes ($1, $2) and double-quoted identifiers correctly.",
	);

	// ─── TEST CASE 6: Property Translation Layer ───
	console.log("\n🧪 Test Case 6: Property Translation Layer");

	const translationPipeline = [
		{
			op: "json_parse" as const,
			args: [{ $init: "tags_blob" }],
			return_var: "parsed",
		},
		{ op: "get" as const, args: [{ $var: "parsed" }, "version"] },
	];

	const row = { tags_blob: '{"version": 42}' };
	const res = executePipeline(translationPipeline, row, {});
	if (res !== 42) {
		throw new Error(`executePipeline failed. Got: ${res}`);
	}
	console.log(
		"✓ executePipeline evaluated JSON nested property correctly (42).",
	);

	const validTranslation = {
		properties: {
			tags_version: {
				internal: "tags_blob",
				transform: { pipeline: translationPipeline },
			},
		},
	};
	validateTableTranslation("items", validTranslation, ["nested_access"]);
	console.log("✓ validateTableTranslation validated a correct pipeline.");

	try {
		const invalidTranslation = {
			properties: {
				bad: {
					internal: "tags_blob",
					transform: {
						pipeline: [
							{ op: "get" as const, args: [{ $var: "non_existent" }, "x"] },
						],
					},
				},
			},
		};
		validateTableTranslation("items", invalidTranslation, ["nested_access"]);
		throw new Error(
			"Should have thrown error on forward/undeclared var reference",
		);
	} catch (err: any) {
		console.log(
			"✓ validateTableTranslation successfully caught undeclared return_var error: " +
				err.message,
		);
	}

	const sqliteSQL = compilePipelineToSQL(translationPipeline, "sqlite");
	if (!sqliteSQL.includes("json_extract(json(`tags_blob`), '$.version')")) {
		throw new Error(`compilePipelineToSQL SQLite failed: ${sqliteSQL}`);
	}

	// Test new conversion and rounding ops
	// 1. to_string
	const strRes = executePipeline([{ op: "to_string", args: [123.45] }], {}, {});
	if (strRes !== "123.45") throw new Error(`to_string failed. Got ${strRes}`);

	// 2. to_number (float & int mode)
	const numFloatRes = executePipeline(
		[{ op: "to_number", args: ["45.67"] }],
		{},
		{},
	);
	if (numFloatRes !== 45.67)
		throw new Error(`to_number float failed. Got ${numFloatRes}`);

	const numIntRes = executePipeline(
		[{ op: "to_number", args: ["45.67", "int"] }],
		{},
		{},
	);
	if (numIntRes !== 45)
		throw new Error(`to_number int failed. Got ${numIntRes}`);

	// 3. round
	const roundRes = executePipeline(
		[{ op: "round", args: [12.3456, 2] }],
		{},
		{},
	);
	if (roundRes !== 12.35) throw new Error(`round failed. Got ${roundRes}`);

	// 4. ceil & floor
	const ceilRes = executePipeline([{ op: "ceil", args: [12.1] }], {}, {});
	if (ceilRes !== 13) throw new Error(`ceil failed. Got ${ceilRes}`);

	const floorRes = executePipeline([{ op: "floor", args: [12.9] }], {}, {});
	if (floorRes !== 12) throw new Error(`floor failed. Got ${floorRes}`);

	// 6. Test variadic arithmetic ops (add [1, 2, 5, 7], mul, sub, div, mod, exp)
	const addVariadic = executePipeline(
		[{ op: "add", args: [1, 2, 5, 7] }],
		{},
		{},
	);
	if (addVariadic !== 15)
		throw new Error(`add variadic failed. Got ${addVariadic}`);

	const subVariadic = executePipeline(
		[{ op: "sub", args: [20, 5, 3] }],
		{},
		{},
	);
	if (subVariadic !== 12)
		throw new Error(`sub variadic failed. Got ${subVariadic}`);

	const mulVariadic = executePipeline([{ op: "mul", args: [2, 3, 4] }], {}, {});
	if (mulVariadic !== 24)
		throw new Error(`mul variadic failed. Got ${mulVariadic}`);

	const divVariadic = executePipeline(
		[{ op: "div", args: [100, 2, 5] }],
		{},
		{},
	);
	if (divVariadic !== 10)
		throw new Error(`div variadic failed. Got ${divVariadic}`);

	const modVariadic = executePipeline(
		[{ op: "mod", args: [100, 30, 7] }],
		{},
		{},
	);
	if (modVariadic !== 3)
		throw new Error(`mod variadic failed. Got ${modVariadic}`);

	const expVariadic = executePipeline([{ op: "exp", args: [2, 3, 2] }], {}, {});
	if (expVariadic !== 64)
		throw new Error(`exp variadic failed. Got ${expVariadic}`);

	// 7. Test string pipeline ops
	const startsWithRes = executePipeline(
		[{ op: "starts_with", args: ["hello world", "hello"] }],
		{},
		{},
	);
	if (startsWithRes !== true) throw new Error(`starts_with pipeline op failed`);

	const endsWithRes = executePipeline(
		[{ op: "ends_with", args: ["hello world", "world"] }],
		{},
		{},
	);
	if (endsWithRes !== true) throw new Error(`ends_with pipeline op failed`);

	// 10. Test variadic pattern matching (contains all/any, starts_with, ends_with)
	const containsAllTrue = executePipeline(
		[{ op: "str_contains", args: ["hello world", "hello", "world"] }],
		{},
		{},
	);
	if (containsAllTrue !== true) throw new Error(`contains all true failed`);

	const containsAllFalse = executePipeline(
		[{ op: "str_contains", args: ["hello world", "hello", "foo"] }],
		{},
		{},
	);
	if (containsAllFalse !== false) throw new Error(`contains all false failed`);

	const containsAnyTrue = executePipeline(
		[{ op: "str_contains", args: ["hello world", "foo", "world", "any"] }],
		{},
		{},
	);
	if (containsAnyTrue !== true) throw new Error(`contains any true failed`);

	const startsWithVariadic = executePipeline(
		[
			{
				op: "starts_with",
				args: ["https://example.com", "http://", "https://"],
			},
		],
		{},
		{},
	);
	if (startsWithVariadic !== true)
		throw new Error(`starts_with variadic failed`);

	const endsWithVariadic = executePipeline(
		[{ op: "ends_with", args: ["image.png", ".jpg", ".png"] }],
		{},
		{},
	);
	if (endsWithVariadic !== true) throw new Error(`ends_with variadic failed`);

	const compiledContainsAnySqlite = compilePipelineToSQL(
		[{ op: "str_contains", args: [{ $init: "url" }, "foo", "bar", "any"] }],
		"sqlite",
	);
	if (
		!compiledContainsAnySqlite.includes(
			"(`url` LIKE '%' || 'foo' || '%' OR `url` LIKE '%' || 'bar' || '%')",
		)
	) {
		throw new Error(
			`contains any sqlite compilation failed: ${compiledContainsAnySqlite}`,
		);
	}

	console.log(
		"✓ All variadic arithmetic, pattern matching, string, and chained comparison pipeline ops evaluated, validated, and compiled correctly.",
	);
	console.log(
		"✓ compilePipelineToSQL (SQLite) compiled nested paths successfully.",
	);

	const pgSQL = compilePipelineToSQL(translationPipeline, "postgres");
	if (!pgSQL.includes("(CAST(\"tags_blob\" AS JSONB)  ->> 'version')")) {
		throw new Error(`compilePipelineToSQL Postgres failed: ${pgSQL}`);
	}
	console.log(
		"✓ compilePipelineToSQL (Postgres) compiled nested paths successfully.",
	);

	// ─── TEST CASE 7: Explicit Wildcards and Array Support in Query Engines ───
	console.log(
		"\n🧪 Test Case 7: Explicit Wildcards and Array Support in Query Engines",
	);

	// 1. In-Memory Engine
	const memEngine = new MemoryQueryEngine({
		items: [
			{ id: 1, name: "Socks", category: "apparel" },
			{ id: 2, name: "Shoes", category: "apparel" },
			{ id: 3, name: "Laptop", category: "electronics" },
		],
	});

	// Prefix match
	const resPrefix = await memEngine.execute("items", {
		filters: [{ property: "name", operator: "like", value: "So%" }],
	});
	if (resPrefix.length !== 1 || (resPrefix[0] as any).name !== "Socks") {
		throw new Error("Prefix wildcard failed in memory engine");
	}

	// Suffix match
	const resSuffix = await memEngine.execute("items", {
		filters: [{ property: "name", operator: "like", value: "%es" }],
	});
	if (resSuffix.length !== 1 || (resSuffix[0] as any).name !== "Shoes") {
		throw new Error("Suffix wildcard failed in memory engine");
	}

	// Array pattern list match (matches any)
	const resArrayLike = await memEngine.execute("items", {
		filters: [{ property: "name", operator: "like", value: ["%oc%", "%ho%"] }],
	});
	if (resArrayLike.length !== 2) {
		throw new Error("Array pattern list match failed in memory engine");
	}

	// Array pattern list NOT match (matches none of them)
	const resArrayNotLike = await memEngine.execute("items", {
		filters: [
			{ property: "name", operator: "not_like", value: ["%x%", "%y%"] },
		],
	});
	if (resArrayNotLike.length !== 3) {
		throw new Error("Array pattern list NOT match failed in memory engine");
	}
	console.log(
		"✓ Memory Query Engine explicit wildcards and array pattern matching passed.",
	);

	// 2. SQLite Engine
	const sqlEngine = new SqliteQueryEngine(":memory:");
	sqlEngine["db"].run(
		"CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, category TEXT)",
	);
	sqlEngine["db"].run(
		"INSERT INTO items (name, category) VALUES ('Socks', 'apparel')",
	);
	sqlEngine["db"].run(
		"INSERT INTO items (name, category) VALUES ('Shoes', 'apparel')",
	);
	sqlEngine["db"].run(
		"INSERT INTO items (name, category) VALUES ('Laptop', 'electronics')",
	);

	// Verify compilation for array
	const sqliteCompiled = sqlEngine.compile("items", {
		filters: [{ property: "name", operator: "like", value: ["%oc%", "%ho%"] }],
	});
	if (
		!sqliteCompiled.sql.includes("(`name` LIKE ? OR `name` LIKE ?)") ||
		sqliteCompiled.params[0] !== "%oc%" ||
		sqliteCompiled.params[1] !== "%ho%"
	) {
		throw new Error(
			`SQLite compiled SQL for array LIKE is invalid: ${JSON.stringify(sqliteCompiled)}`,
		);
	}

	// Verify execution
	const sqliteArrayResults = await sqlEngine.execute("items", {
		filters: [{ property: "name", operator: "like", value: ["%oc%", "%ho%"] }],
	});
	if (sqliteArrayResults.length !== 2) {
		throw new Error("SQLite execution for array LIKE failed");
	}
	console.log(
		"✓ SQLite Query Engine compilation and execution for explicit wildcards and array patterns passed.",
	);

	// 3. PostgreSQL Engine compiler check
	const pgEngine2 = new PgQueryEngine("postgresql://localhost:5432/postgres");
	const pgCompiled2 = pgEngine2.compile("items", {
		filters: [{ property: "name", operator: "like", value: ["%oc%", "%ho%"] }],
	});
	if (
		!pgCompiled2.sql.includes('("name" LIKE $1 OR "name" LIKE $2)') ||
		(pgCompiled2.params[0] as any) !== "%oc%" ||
		(pgCompiled2.params[1] as any) !== "%ho%"
	) {
		throw new Error(
			`Postgres compiled SQL for array LIKE is invalid: ${JSON.stringify(pgCompiled2)}`,
		);
	}
	console.log(
		"✓ PostgreSQL Query Compiler output correctly parameterized SQL for array patterns.",
	);

	// ─── TEST CASE 8: Memory Engine ResourceLocator Data Loading ───
	console.log("\n🧪 Test Case 8: Memory Engine ResourceLocator Data Loading");
	const testDataPath = path.join(
		process.cwd(),
		"config",
		"test_resource_data.json",
	);
	const testData = {
		items: [{ id: 1, name: "ResourceBook", price: 45, category: "books" }],
	};
	await fs.writeFile(testDataPath, JSON.stringify(testData, null, 2));

	const { resolveAdapter } = require("../src/config/loader");
	const resourceEngine: any = await resolveAdapter("memory-engine", {
		data: {
			_type: "file",
			path: "./config/test_resource_data.json",
		},
	});

	const resourceResults = await resourceEngine.execute("items", {
		filters: [{ property: "name", operator: "eq", value: "ResourceBook" }],
	});

	if (
		resourceResults.length !== 1 ||
		(resourceResults[0] as any).price !== 45
	) {
		throw new Error(
			`Memory engine failed to load datasets using ResourceLocator: ${JSON.stringify(resourceResults)}`,
		);
	}
	console.log(
		"✓ Memory Engine successfully loaded external data from ResourceLocator.",
	);

	// Cleanup
	await fs.unlink(testDataPath);

	// ─── TEST CASE 9: Filter Store GC and Auto-Compression ───
	console.log("\n🧪 Test Case 9: Filter Store GC and Auto-Compression");

	// Create store with chain threshold = 3
	const gcFilterStore = new FilterStore(
		new MemorySessionFilterStore(),
		new MemoryPersistentFilterStore(),
		toolSchemas,
		new Map<string, TableSchema>(),
		3,
	);

	const sessionId = "gc_session_999";
	const rootId = await gcFilterStore.init(sessionId, "browse_catalog", "items");

	// 1. Verify Auto-Compression
	const id1 = await gcFilterStore.add(
		rootId,
		[{ property: "category", operator: "eq", value: "apparel" }],
		sessionId,
	);
	const id2 = await gcFilterStore.add(
		id1,
		[{ property: "price", operator: "gt", value: 10 }],
		sessionId,
	);

	// Checking depth: rootId(1) -> id1(2) -> id2(3). Adding id3 will hit depth 4 (exceeding threshold 3)
	const id3 = await gcFilterStore.add(
		id2,
		[{ property: "price", operator: "lt", value: 100 }],
		sessionId,
	);

	// id3 should be compressed. Check that parentFilterId is null (as root was the only parent and not a branch point)
	const state3 = await gcFilterStore["session"].get(sessionId, id3);
	if (!state3 || state3.parentFilterId !== null) {
		throw new Error(
			`Auto-compression failed: state3 is ${JSON.stringify(state3)}`,
		);
	}

	// The resolved rules should have all 3 conditions
	const rules = await gcFilterStore.getFilterRules(id3, sessionId);
	if (rules.length !== 3) {
		throw new Error(
			`Auto-compression rules resolution failed. Got: ${JSON.stringify(rules)}`,
		);
	}
	console.log(
		"✓ FilterStore auto-compression successfully flattened linear chain.",
	);

	// 2. Verify Branch Point resets depth and preserves branch points
	const rootId2 = await gcFilterStore.init(
		sessionId,
		"browse_catalog",
		"items",
	);
	// Branch point setup:
	// rootId2 -> bid1
	// rootId2 -> bid2 (branch point created)
	const bid1 = await gcFilterStore.add(
		rootId2,
		[{ property: "category", operator: "eq", value: "apparel" }],
		sessionId,
	);
	const bid2 = await gcFilterStore.add(
		rootId2,
		[{ property: "category", operator: "eq", value: "electronics" }],
		sessionId,
	);

	// Check bid2 linearDepth — should be 1 because rootId2 now has multiple children (bid1 and bid2)
	const stateBid2 = await gcFilterStore["session"].get(sessionId, bid2);
	if (!stateBid2 || stateBid2.linearDepth !== 1) {
		throw new Error(
			`Linear depth of branch node should be 1, got: ${stateBid2?.linearDepth}`,
		);
	}

	// Extend bid2 to bid3 and bid4
	const bid3 = await gcFilterStore.add(
		bid2,
		[{ property: "price", operator: "gt", value: 50 }],
		sessionId,
	); // depth 2
	const bid4 = await gcFilterStore.add(
		bid3,
		[{ property: "price", operator: "lt", value: 150 }],
		sessionId,
	); // depth 3
	const bid5 = await gcFilterStore.add(
		bid4,
		[{ property: "price", operator: "neq", value: 100 }],
		sessionId,
	); // depth 4 -> trigger suffix compression

	// bid5 should be suffix-compressed, pointing back to rootId2 (the branch point) as its parentFilterId
	const stateBid5 = await gcFilterStore["session"].get(sessionId, bid5);
	if (!stateBid5 || stateBid5.parentFilterId !== rootId2) {
		throw new Error(
			`Suffix compression failed to stop at branch point: parent is ${stateBid5?.parentFilterId}`,
		);
	}
	console.log("✓ Suffix compression correctly preserves branch points.");

	// 3. Verify targeted GC
	// Let's create a dead branch off rootId2: bid_dead
	const bidDead = await gcFilterStore.add(
		rootId2,
		[{ property: "price", operator: "lt", value: 5 }],
		sessionId,
	);

	// If we GC keeping only bid5, bidDead should be pruned, but rootId2, bid5 should be preserved.
	// bid2, bid3, and bid4 were replaced by bid5 (the suffix compressed node) so they are bypassed by bid5's parent chain.
	// Hence bid2, bid3, and bid4 should be deleted, and bidDead should be deleted.
	const gcResult = await gcFilterStore.gc(sessionId, [bid5]);

	// Check if bidDead is deleted
	const deadNode = await gcFilterStore["session"].get(sessionId, bidDead);
	if (deadNode) {
		throw new Error("Targeted GC failed to prune dead branch.");
	}

	// Check if compressed intermediate nodes bid2, bid3, and bid4 are pruned
	const node2 = await gcFilterStore["session"].get(sessionId, bid2);
	const node3 = await gcFilterStore["session"].get(sessionId, bid3);
	const node4 = await gcFilterStore["session"].get(sessionId, bid4);
	if (node2 || node3 || node4) {
		throw new Error(
			"Targeted GC failed to prune compressed intermediate nodes.",
		);
	}

	// Check if active node bid5 and branch point rootId2 are kept
	const node5 = await gcFilterStore["session"].get(sessionId, bid5);
	const nodeRoot = await gcFilterStore["session"].get(sessionId, rootId2);
	if (!node5 || !nodeRoot) {
		throw new Error("Targeted GC deleted active or ancestor nodes.");
	}
	console.log(
		"✓ FilterStore targeted GC successfully pruned dead branches and compressed intermediate garbage.",
	);

	console.log("\n🧪 Test Case 10: Filter State Aliasing and Pruning");

	const aliasFilterStore = new FilterStore(
		new MemorySessionFilterStore(),
		new MemoryPersistentFilterStore(),
		toolSchemas,
		new Map<string, TableSchema>(),
		5,
	);

	const sessionIdAlias = "alias_session_1";

	// 1. Initialize with an alias
	const aliasVal = "electronics";
	const initId = await aliasFilterStore.init(
		sessionIdAlias,
		"browse_catalog",
		"items",
		undefined,
		aliasVal,
	);
	if (initId !== "electronics") {
		throw new Error(
			`Expected alias "electronics" to be returned, got ${initId}`,
		);
	}

	// Verify the alias points to the underlying state ID
	const resolvedInitId = await aliasFilterStore["resolveId"](
		aliasVal,
		sessionIdAlias,
	);
	if (!resolvedInitId.startsWith("filter_")) {
		throw new Error(
			`Expected resolved ID to be a filter UUID prefix, got ${resolvedInitId}`,
		);
	}

	// 2. Perform mutation without changing alias name (pointer should auto-advance)
	const childId1 = await aliasFilterStore.add(
		"electronics",
		[{ property: "price", operator: "gt", value: 100 }],
		sessionIdAlias,
	);
	if (childId1 !== "electronics") {
		throw new Error(
			`Expected active alias "electronics" to be returned from add, got ${childId1}`,
		);
	}
	const resolvedChildId1 = await aliasFilterStore["resolveId"](
		"electronics",
		sessionIdAlias,
	);
	if (resolvedChildId1 === resolvedInitId) {
		throw new Error(`Expected alias pointer to advance to the new child state`);
	}

	// 3. Progressive Tagging / Branching (using new_alias)
	const childId2 = await aliasFilterStore.add(
		"electronics",
		[{ property: "category", operator: "eq", value: "apparel" }],
		sessionIdAlias,
		undefined,
		"electronics_apple",
	);
	if (childId2 !== "electronics_apple") {
		throw new Error(
			`Expected new alias "electronics_apple" to be returned, got ${childId2}`,
		);
	}

	// Check pointers:
	// "electronics" should still point to childId1 (resolvedChildId1)
	const resolvedElectronics = await aliasFilterStore["resolveId"](
		"electronics",
		sessionIdAlias,
	);
	if (resolvedElectronics !== resolvedChildId1) {
		throw new Error(
			`Expected "electronics" to still point to parent checkpoint`,
		);
	}
	// "electronics_apple" should point to the new state
	const resolvedElectronicsApple = await aliasFilterStore["resolveId"](
		"electronics_apple",
		sessionIdAlias,
	);
	if (resolvedElectronicsApple === resolvedElectronics) {
		throw new Error(`Expected "electronics_apple" to point to the new branch`);
	}

	// 4. GC with Alias pruning (Whitelist/Blacklist)
	// Let's add a dead branch from electronics with a new alias
	const deadId = await aliasFilterStore.add(
		"electronics",
		[{ property: "price", operator: "lt", value: 50 }],
		sessionIdAlias,
		undefined,
		"electronics_cheap",
	);

	// Verify that it is in the session
	const cheapState = await aliasFilterStore["session"].get(
		sessionIdAlias,
		await aliasFilterStore["resolveId"]("electronics_cheap", sessionIdAlias),
	);
	if (!cheapState) {
		throw new Error("Expected cheap branch state to exist");
	}

	// Prune using whitelist (only keep electronics_apple and electronics)
	await aliasFilterStore.gc(
		sessionIdAlias,
		[],
		["electronics", "electronics_apple"],
	);

	// electronics_cheap alias should be deleted
	const resolvedCheap = await aliasFilterStore["resolveId"](
		"electronics_cheap",
		sessionIdAlias,
	);
	if (resolvedCheap === "electronics_cheap") {
		// If it doesn't resolve, it just returns the input string
		const cheapNode = await aliasFilterStore["session"].get(
			sessionIdAlias,
			resolvedCheap,
		);
		if (cheapNode) {
			throw new Error("Expected cheap branch to be garbage collected");
		}
	} else {
		throw new Error(
			`Expected electronics_cheap alias to be deleted, but it resolved to ${resolvedCheap}`,
		);
	}

	console.log(
		"✓ State aliasing, branching, and GC alias whitelists/blacklists verified successfully.",
	);

	console.log("\n🧪 Test Case 11: Filter Diff and Schema Guard");
	const f1 = await aliasFilterStore.init(
		sessionIdAlias,
		"browse_catalog",
		"items",
	);
	const f2 = await aliasFilterStore.add(
		f1,
		[{ property: "price", operator: "gt", value: 100 }],
		sessionIdAlias,
	);
	const f3 = await aliasFilterStore.add(
		f2,
		[{ property: "category", operator: "eq", value: "apparel" }],
		sessionIdAlias,
	);

	// Diff f3 against f1 (f3 has added rules)
	const diffResult = await aliasFilterStore.diff(f1, f3, sessionIdAlias);
	if (diffResult.added.length !== 2 || diffResult.removed.length !== 0) {
		throw new Error(
			`Expected 2 added rules and 0 removed rules, got: ${JSON.stringify(diffResult)}`,
		);
	}

	// Diff f3 against f2 (f2 has one rule, f3 has two rules. Diffing f3 and f2 should show category=apparel added/removed depending on direction)
	const diffResult2 = await aliasFilterStore.diff(f3, f2, sessionIdAlias);
	if (
		diffResult2.removed.length !== 1 ||
		diffResult2.removed[0]?.property !== "category"
	) {
		throw new Error(
			`Expected category rule to be removed when diffing f3 -> f2, got: ${JSON.stringify(diffResult2)}`,
		);
	}

	// Schema mismatch check
	const fSchemaA = await aliasFilterStore.init(
		sessionIdAlias,
		"browse_catalog",
		"items",
	);

	// Dynamically register some_other_tool to bypass registration checks during init
	aliasFilterStore["toolSchemas"].set("some_other_tool", {
		items: { filterable_properties: [], operators: [], mock_dataset: [] },
	});
	const fSchemaB = await aliasFilterStore.init(
		sessionIdAlias,
		"some_other_tool",
		"items",
	);

	try {
		await aliasFilterStore.diff(fSchemaA, fSchemaB, sessionIdAlias);
		throw new Error("Expected SCHEMA_MISMATCH error to be thrown");
	} catch (err: any) {
		if (err.code !== "SCHEMA_MISMATCH") {
			throw new Error(
				`Expected SCHEMA_MISMATCH error code, got ${err.code || err.message}`,
			);
		}
	}
	console.log("✓ Filter diff and schema guard verified successfully.");

	console.log("\n🧪 Test Case 12: Filter Pre-populated Initialization");
	const initRules: FilterCondition[] = [
		{ property: "price", operator: "gt", value: 50 },
		{ property: "category", operator: "eq", value: "apparel" },
	];
	// Initialize with rules directly
	const fPopulated = await aliasFilterStore.init(
		sessionIdAlias,
		"browse_catalog",
		"items",
		undefined,
		"catalog_prepopulated",
		initRules,
	);

	const populatedRules = await aliasFilterStore.getFilterRules(
		fPopulated,
		sessionIdAlias,
	);
	if (
		populatedRules.length !== 2 ||
		populatedRules[0]?.property !== "price" ||
		populatedRules[1]?.property !== "category"
	) {
		throw new Error(
			`Expected 2 rules pre-populated in filter, got: ${JSON.stringify(populatedRules)}`,
		);
	}
	console.log("✓ Filter pre-populated initialization verified successfully.");

	console.log("\n🧪 Test Case 13: Filter Persistent Saving & Auto-Compression");
	const saveFilterId = await aliasFilterStore.init(
		sessionIdAlias,
		"browse_catalog",
		"items",
	);
	const uncompressedFilterId = await aliasFilterStore.add(
		saveFilterId,
		[{ property: "price", operator: "gt", value: 100 }],
		sessionIdAlias,
	);

	const savedFilterId = await aliasFilterStore.save(
		uncompressedFilterId,
		["tag-filter"],
		"Auto-compressed filter",
		{ level: "global" },
		sessionIdAlias,
		() => true,
	);

	if (savedFilterId === uncompressedFilterId) {
		throw new Error(
			"Expected saving an uncompressed filter to return a new auto-compressed filter ID",
		);
	}

	const persistedFilter = await aliasFilterStore["persistent"].get(
		savedFilterId,
		{ level: "global" },
	);
	if (!persistedFilter || persistedFilter.parentFilterId !== null) {
		throw new Error(
			`Persisted filter not found or not compressed: ${JSON.stringify(persistedFilter)}`,
		);
	}
	console.log(
		"✓ Filter persistent save with auto-compression verified successfully.",
	);
}
