import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import { SqlBackend } from "../src/adapters/storage/sql/backend";

const TEST_DIR = path.resolve(process.cwd(), "temp_duckdb_test");
const CSV_FILE = path.join(TEST_DIR, "users.csv");
const JSONL_FILE = path.join(TEST_DIR, "logs.jsonl");

describe("DuckDB External Table Mounting", () => {
	beforeAll(async () => {
		await fs.mkdir(TEST_DIR, { recursive: true });

		// Seed a CSV file
		const csvData = ["id,name,role", "1,Alice,Admin", "2,Bob,User"].join("\n");
		await fs.writeFile(CSV_FILE, csvData, "utf-8");

		// Seed a JSONL file
		const jsonlData = [
			JSON.stringify({ id: 101, event: "LOGIN", status: "success" }),
			JSON.stringify({ id: 102, event: "LOGOUT", status: "success" }),
		].join("\n");
		await fs.writeFile(JSONL_FILE, jsonlData, "utf-8");
	});

	afterAll(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch (_) {}
	});

	test("should mount CSV and JSONL files as queryable views via SqlBackend", async () => {
		const targetConfig = {
			path: ":memory:",
			schema: {
				ext_users: CSV_FILE,
				ext_logs: JSONL_FILE,
			},
		};

		const backend = await SqlBackend.connect(
			"duckdb",
			JSON.stringify(targetConfig),
		);

		// 1. Query the CSV view
		const users = await backend.query(
			"SELECT * FROM ext_users ORDER BY id ASC",
		);
		expect(users).toBeDefined();
		expect(users.length).toBe(2);
		expect(users[0]!.name).toBe("Alice");
		expect(users[0]!.role).toBe("Admin");
		expect(users[1]!.name).toBe("Bob");

		// 2. Query the JSONL view
		const logs = await backend.query("SELECT * FROM ext_logs ORDER BY id ASC");
		expect(logs).toBeDefined();
		expect(logs.length).toBe(2);
		expect(logs[0]!.event).toBe("LOGIN");
		expect(logs[0]!.status).toBe("success");
		expect(logs[1]!.event).toBe("LOGOUT");
	});
});
