import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import {
	JsonlPersistentFormStore,
	JsonlSessionFormStore,
} from "../src/adapters/storage/jsonl-repo";
import {
	MemoryPersistentFormStore,
	MemorySessionFormStore,
} from "../src/adapters/storage/memory-repo";
import { SqliteFormStore } from "../src/adapters/storage/sqlite-repo";
import type { FormSchema } from "../src/config/types";
import { FormStore } from "../src/middleware/form/store";

const TEST_DIR = path.resolve(process.cwd(), "temp_test_form");
const JSONL_SESSION = path.join(TEST_DIR, "session.jsonl");
const JSONL_PERSISTENT = path.join(TEST_DIR, "persistent.jsonl");
const SQLITE_DB = path.join(TEST_DIR, "form_test.db");

const testSchema: FormSchema = {
	form_id: "patient_intake",
	sections: {
		sec_demographics: {
			title: "Demographics",
			questions: ["q_name", "q_age"],
			next: { default: "sec_habits" },
		},
		sec_habits: {
			title: "Lifestyle Habits",
			questions: ["q_smoke", "q_smoke_frequency", "q_alcohol"],
			next: { default: null },
		},
	},
	questions: {
		q_name: {
			text: "Full Name",
			answer_type: "free_text",
			required: true,
		},
		q_age: {
			text: "Age",
			answer_type: "number",
			required: true,
			next: [
				{
					condition: { operator: "lt", value: 18 },
					target: "q_parental_consent",
				},
				{
					condition: { operator: "geq", value: 18 },
					target: "q_smoke",
				},
			],
		},
		q_parental_consent: {
			text: "Parental Consent Signature",
			answer_type: "free_text",
			required: true,
			next: { default: "q_smoke" },
		},
		q_smoke: {
			text: "Do you currently smoke?",
			answer_type: "boolean",
			required: true,
			next: [
				{
					condition: { operator: "eq", value: true },
					target: "q_smoke_frequency",
				},
				{
					condition: { operator: "eq", value: false },
					target: "q_alcohol",
				},
			],
		},
		q_smoke_frequency: {
			text: "How many cigarettes per day?",
			answer_type: "scale",
			scale: { min: 1, max: 100 },
			required: true,
			next: { default: "q_alcohol" },
		},
		q_alcohol: {
			text: "Alcohol usage description",
			answer_type: "free_text",
			required: false,
		},
	},
	start_section: "sec_demographics",
	start_question: "q_name",
};

describe("Stateful Form Service", () => {
	beforeAll(async () => {
		await fs.mkdir(TEST_DIR, { recursive: true });
	});

	afterAll(async () => {
		try {
			await fs.rm(TEST_DIR, { recursive: true, force: true });
		} catch (_) {}
	});

	const schemas = new Map<string, FormSchema>([["patient_intake", testSchema]]);

	describe.each([
		[
			"Memory Store",
			() =>
				new FormStore(
					new MemorySessionFormStore(),
					new MemoryPersistentFormStore(),
					schemas,
				),
		],
		[
			"JSONL Store",
			() =>
				new FormStore(
					new JsonlSessionFormStore(JSONL_SESSION),
					new JsonlPersistentFormStore(JSONL_PERSISTENT),
					schemas,
				),
		],
		[
			"SQLite Store",
			() =>
				new FormStore(
					new SqliteFormStore(SQLITE_DB),
					new SqliteFormStore(SQLITE_DB),
					schemas,
				),
		],
	])("%s", (_title, createStore) => {
		let store: FormStore;
		const session = "test-session";

		beforeAll(() => {
			store = createStore();
		});

		test("Initialize form and answer linear flow", async () => {
			const fId = await store.init("patient_intake", session);
			expect(fId).toBeDefined();

			// Answer Name
			let res = await store.answer(fId, "q_name", "John Doe", session);
			expect(res.next_questions).toEqual(["q_age"]);
			expect(res.complete).toBe(false);

			// Answer Age (Adult: age >= 18 -> targets q_smoke next)
			res = await store.answer(res.form_id, "q_age", 25, session);
			expect(res.next_questions).toEqual(["q_smoke"]);
			expect(res.complete).toBe(false);
		});

		test("Conditional branching on answers", async () => {
			const fId = await store.init("patient_intake", session);

			// Path A: Adult Smoker (q_smoke = true -> asks q_smoke_frequency)
			let res = await store.answer(fId, "q_name", "John Doe", session);
			res = await store.answer(res.form_id, "q_age", 30, session);

			const smokerRes = await store.answer(
				res.form_id,
				"q_smoke",
				true,
				session,
			);
			expect(smokerRes.next_questions).toEqual(["q_smoke_frequency"]);

			// Path B: Adult Non-Smoker (q_smoke = false -> skips q_smoke_frequency directly to q_alcohol)
			const nonSmokerRes = await store.answer(
				res.form_id,
				"q_smoke",
				false,
				session,
			);
			expect(nonSmokerRes.next_questions).toEqual(["q_alcohol"]);
		});

		test("Range validations (scale)", async () => {
			const fId = await store.init("patient_intake", session);
			let res = await store.answer(fId, "q_name", "John Doe", session);
			res = await store.answer(res.form_id, "q_age", 30, session);
			res = await store.answer(res.form_id, "q_smoke", true, session);

			// Scale range is 1 to 100. Let's try 0 and 150 (should throw)
			expect(
				store.answer(res.form_id, "q_smoke_frequency", 0, session),
			).rejects.toThrow();
			expect(
				store.answer(res.form_id, "q_smoke_frequency", 150, session),
			).rejects.toThrow();

			// Valid answer
			res = await store.answer(res.form_id, "q_smoke_frequency", 5, session);
			expect(res.next_questions).toEqual(["q_alcohol"]);
		});

		test("Back-navigation and stale answer tracking", async () => {
			const fId = await store.init("patient_intake", session);

			// Start: John, 30, Smoker (5/day)
			let res = await store.answer(fId, "q_name", "John", session);
			res = await store.answer(res.form_id, "q_age", 30, session);
			res = await store.answer(res.form_id, "q_smoke", true, session);
			res = await store.answer(res.form_id, "q_smoke_frequency", 5, session);

			// Navigate back to q_smoke
			const backRes = await store.back(res.form_id, "q_smoke", session);
			expect(backRes.next_questions).toEqual(["q_smoke"]);

			// Change answer of q_smoke to false (non-smoker)
			const changedRes = await store.answer(
				backRes.form_id,
				"q_smoke",
				false,
				session,
			);

			// q_smoke_frequency should now be flagged as stale because the path shifted
			expect(changedRes.stale).toContain("q_smoke_frequency");

			// Verify that resolve excludes the stale question answer
			// q_alcohol is optional, so complete should be true
			const resolved = await store.resolve(changedRes.form_id, session);
			expect(resolved.answers.q_smoke_frequency).toBeUndefined();
			expect(resolved.answers.q_smoke).toBe(false);
			expect(resolved.answers.q_name).toBe("John");
		});

		test("Skip validation checks", async () => {
			const fId = await store.init("patient_intake", session);
			let res = await store.answer(fId, "q_name", "Jane", session);
			res = await store.answer(res.form_id, "q_age", 30, session);
			res = await store.answer(res.form_id, "q_smoke", false, session);

			// q_alcohol is optional (required: false). Skipping should succeed.
			const skipRes = await store.skip(res.form_id, "q_alcohol", session);
			expect(skipRes.complete).toBe(true);

			// Verify that resolve succeeds and lists q_alcohol in skipped
			const resolved = await store.resolve(skipRes.form_id, session);
			expect(resolved.skipped).toContain("q_alcohol");

			// q_name is required. Skipping it should fail.
			expect(store.skip(res.form_id, "q_name", session)).rejects.toThrow();
		});

		test("Persistent save and retrieval with auto-compression", async () => {
			const fId = await store.init("patient_intake", session);
			let res = await store.answer(fId, "q_name", "Jane Save", session);
			res = await store.answer(res.form_id, "q_age", 30, session);

			// res has parentFormId !== null. Saving it should auto-compress and return a new compressed ID.
			const savedId = await store.save(
				res.form_id,
				["tag1"],
				"Test Form",
				{ level: "global" },
				session,
			);
			expect(savedId).not.toBe(res.form_id);
			expect(savedId.startsWith("form_comp_")).toBe(true);

			// Verify we can retrieve it and it has the active answers
			const persisted = await (store as any).persistentStore.get(savedId, {
				level: "global",
			});
			expect(persisted).toBeDefined();
			expect(persisted.tags).toContain("tag1");
			expect(persisted.description).toBe("Test Form");
			expect(persisted.answers.q_name).toBe("Jane Save");
			expect(persisted.answers.q_age).toBe(30);
		});
	});
});
