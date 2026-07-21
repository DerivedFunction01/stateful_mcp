import { beforeAll, describe, expect, test } from "bun:test";
import {
	MemoryPersistentFilterStore,
	MemoryPersistentFormStore,
	MemoryPersistentObjectStore,
	MemorySessionFilterStore,
	MemorySessionFormStore,
	MemorySessionObjectStore,
} from "../src/adapters/storage/memory-repo";
import type { FormSchema } from "../src/config/types";
import { FilterStore } from "../src/middleware/filter/store";
import { FormStore } from "../src/middleware/form/store";
import { ObjectStore } from "../src/middleware/object/store";

describe("Cross-Service Referential Integrity", () => {
	let filterStore: FilterStore;
	let objectStore: ObjectStore;
	let formStore: FormStore;
	const session = "ref-session-1";

	beforeAll(() => {
		filterStore = new FilterStore(
			new MemorySessionFilterStore(),
			new MemoryPersistentFilterStore(),
			new Map(),
			new Map(),
			20,
		);

		const objectSchemas = new Map<string, any>([
			[
				"report_template",
				{
					type: "object",
					properties: {
						title: { type: "string" },
						target_filter: { type: "string", "x-mcp-ref": "filter" },
					},
					required: ["title", "target_filter"],
				},
			],
		]);

		objectStore = new ObjectStore(
			new MemorySessionObjectStore(),
			new MemoryPersistentObjectStore(),
			objectSchemas,
		);

		const formSchema: FormSchema = {
			form_id: "intake_form",
			questions: {
				q_patient_id: {
					text: "Select Patient Profile Object ID",
					answer_type: "free_text",
					required: true,
					"x-mcp-ref": "object",
				} as any,
			},
			start_question: "q_patient_id",
		};

		formStore = new FormStore(
			new MemorySessionFormStore(),
			new MemoryPersistentFormStore(),
			new Map([["intake_form", formSchema]]),
		);

		// Cross-link references
		objectStore.setReferences({ filter: filterStore, form: formStore });
		formStore.setReferences({ filter: filterStore, object: objectStore });
	});

	test("Object validation fails when referenced filter ID does not exist", async () => {
		// Initialize an object pointing to a non-existent filter ID "filt_invalid"
		const objId = await objectStore.init(
			"report_template",
			session,
			undefined,
			{
				title: "Quarterly Report",
				target_filter: "filt_invalid",
			},
		);

		const valResult = await objectStore.validate(objId, session);
		expect(valResult.valid).toBe(false);
		expect(valResult.invalid?.[0]?.reason).toContain(
			"does not point to a valid filter",
		);
	});

	test("Object validation succeeds when referenced filter ID exists", async () => {
		// Create a valid filter in the filter store
		const filterId = await filterStore.init(session, undefined, undefined);

		// Initialize an object pointing to the valid filter ID
		const objId = await objectStore.init(
			"report_template",
			session,
			undefined,
			{
				title: "Quarterly Report",
				target_filter: filterId,
			},
		);

		const valResult = await objectStore.validate(objId, session);
		expect(valResult.valid).toBe(true);
	});

	test("Form answer validation fails when referenced object ID does not exist", async () => {
		const formId = await formStore.init("intake_form", session);

		// Answer with an invalid object ID
		expect(
			formStore.answer(formId, "q_patient_id", "obj_nonexistent", session),
		).rejects.toThrow("is not a valid object ID in session");
	});

	test("Form answer validation succeeds when referenced object ID exists", async () => {
		const formId = await formStore.init("intake_form", session);

		// Create a valid object
		const objId = await objectStore.init(
			"report_template",
			session,
			undefined,
			{
				title: "Test",
				target_filter: "non_checked", // we bypass validator checks for simple init
			},
		);

		// Answer with the valid object ID
		const result = await formStore.answer(
			formId,
			"q_patient_id",
			objId,
			session,
		);
		expect(result.complete).toBe(true);
	});
});
