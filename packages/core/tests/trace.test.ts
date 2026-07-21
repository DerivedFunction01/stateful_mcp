import { beforeEach, describe, expect, test } from "bun:test";
import { TraceStore } from "../src/middleware/trace/store";
import type { TraceForm } from "../src/middleware/trace/types";

describe("TraceStore Engine Tests", () => {
	let store: TraceStore;

	beforeEach(() => {
		store = new TraceStore();
	});

	test("recordTrace normalizes step IDs with auto-incrementing suffixes", () => {
		const rawForm: TraceForm = {
			trace_id: "patient_triage_v1",
			goal: "Triage incoming patient and filter department",
			steps: [
				{ action: "filter_init" } as any,
				{
					action: "filter_add_rule",
					args: { field: "dept", op: "eq", value: "$input.dept" },
				},
				{
					action: "filter_add_rule",
					args: { field: "status", op: "eq", value: "active" },
				},
			],
		};

		const recorded = store.recordTrace(rawForm);
		expect(recorded.steps[0]!.id).toBe("filter_init_1");
		expect(recorded.steps[1]!.id).toBe("filter_add_rule_1");
		expect(recorded.steps[2]!.id).toBe("filter_add_rule_2");
		expect(recorded.start_step).toBe("filter_init_1");
		expect(recorded.confidence_score).toBe(1.0);
		expect(recorded.usage_count).toBe(0);
	});

	test("queryTraces finds matching trace by intent fuzzy search", () => {
		store.recordTrace({
			trace_id: "patient_triage",
			goal: "Triage patient clinical data and assign department filter",
			steps: [{ id: "s1", action: "triage" }],
		});

		const result = store.queryTraces("triage patient data");
		expect(result.matches.length).toBe(1);
		expect(result.matches[0]!.trace_id).toBe("patient_triage");
		expect(result.matches[0]!.confidence_score).toBeGreaterThan(0.5);
		expect(result.total).toBe(1);
		expect(result.has_more).toBe(false);
	});

	test("queryTraces supports pagination with offset and limit", () => {
		store.recordTrace({
			trace_id: "t_query_1",
			goal: "Query patient record 1",
			steps: [],
		});
		store.recordTrace({
			trace_id: "t_query_2",
			goal: "Query patient record 2",
			steps: [],
		});
		store.recordTrace({
			trace_id: "t_query_3",
			goal: "Query patient record 3",
			steps: [],
		});

		const page1 = store.queryTraces("Query patient", 2, 0);
		expect(page1.matches.length).toBe(2);
		expect(page1.total).toBe(3);
		expect(page1.has_more).toBe(true);
		expect(page1.next_offset).toBe(2);

		const page2 = store.queryTraces("Query patient", 2, page1.next_offset);
		expect(page2.matches.length).toBe(1);
		expect(page2.has_more).toBe(false);
	});

	test("executeTrace executes steps with variable bindings and AST conditions", async () => {
		store.recordTrace({
			trace_id: "system_scale",
			goal: "Scale cluster if CPU usage exceeds threshold",
			input_slots: {
				cpu_pct: {
					type: "number",
					description: "Current CPU percentage",
					required: true,
				},
			},
			steps: [
				{
					id: "check_cpu",
					action: "get_metrics",
					args: { pct: "$input.cpu_pct" },
					conditions: [
						{
							pipeline: [
								{
									op: "get",
									args: [{ $init: "response" }, "cpu"],
									return_var: "cpu",
								},
								{ op: "gt", args: [{ $var: "cpu" }, 80] },
							],
							target: "scale_up",
						},
					],
					default_target: "idle",
				},
				{
					id: "scale_up",
					action: "scale_up",
					args: { replicas: 5 },
				},
				{
					id: "idle",
					action: "idle",
					args: {},
				},
			],
		});

		const executor = async (action: string, args: Record<string, any>) => {
			if (action === "get_metrics") return { cpu: args.pct };
			if (action === "scale_up")
				return { scaled: true, replicas: args.replicas };
			return { idle: true };
		};

		const res = await store.executeTrace(
			"system_scale",
			{ cpu_pct: 92 },
			executor,
		);
		expect(res.status).toBe("completed");
		expect(res.step_results?.["scale_up"]).toEqual({
			scaled: true,
			replicas: 5,
		});
	});

	test("executeTrace pauses when step has autonomous=false and resumes via resumeTrace", async () => {
		store.recordTrace({
			trace_id: "fund_transfer",
			goal: "Transfer funds with human approval",
			steps: [
				{ id: "s1", action: "hold_funds", args: { amount: 100 } },
				{
					id: "s2",
					action: "transfer_funds",
					autonomous: false,
					args: { target: "ACC-123" },
				},
			],
		});

		const res = await store.executeTrace("fund_transfer", {});
		expect(res.status).toBe("paused");
		expect(res.requires_approval).toBe(true);
		expect(res.approval_tool).toBe("transfer_funds");
		expect(res.resume_token).toBeDefined();

		const resumed = await store.resumeTrace(res.resume_token!, {
			transfer_id: "TX-999",
		});
		expect(resumed.status).toBe("completed");
		expect(resumed.output).toEqual({ transfer_id: "TX-999" });
	});

	test("refineTrace delta operations (replace_step, append_step, remove_step, swap_with_persistent)", () => {
		store.recordTrace({
			trace_id: "workflow_v1",
			goal: "Editable workflow",
			steps: [
				{ id: "step_1", action: "init" },
				{ id: "step_2", action: "process" },
				{ id: "step_3", action: "finalize" },
			],
		});

		// Replace step
		store.refineTrace("workflow_v1", {
			action: "replace_step",
			step_id: "step_2",
			new_step: { id: "step_2", action: "custom_process" },
		});

		let inspected = store.inspectTrace("workflow_v1");
		expect(inspected?.steps[1]!.action).toBe("custom_process");

		// Remove step
		store.refineTrace("workflow_v1", {
			action: "remove_step",
			step_id: "step_1",
		});
		inspected = store.inspectTrace("workflow_v1");
		expect(inspected?.steps.length).toBe(2);
		expect(inspected?.steps[0]!.id).toBe("step_2");

		// Swap with persistent
		store.refineTrace("workflow_v1", {
			action: "swap_with_persistent",
			step_id: "step_2",
			persistent_key: "cached_process_v1",
		});
		inspected = store.inspectTrace("workflow_v1");
		expect(inspected?.steps[0]!.action).toBe("load_persistent");
	});

	test("feedbackTrace updates confidence scores", () => {
		store.recordTrace({
			trace_id: "trace_fb",
			goal: "Feedback trace",
			confidence_score: 0.8,
			steps: [{ id: "s1", action: "noop" }],
		});

		store.feedbackTrace("trace_fb", "success");
		expect(store.inspectTrace("trace_fb")?.confidence_score).toBe(0.85);

		store.feedbackTrace("trace_fb", "failure");
		expect(store.inspectTrace("trace_fb")?.confidence_score).toBe(0.65);
	});

	test("interactive session recording automatically captures steps and compiles TraceForm", () => {
		const session_id = "rec-session-123";
		const started = store.startRecording(
			session_id,
			"auto_recorded_macro",
			"Automated macro goal",
			{
				dept: {
					type: "string",
					description: "Department name",
					required: true,
				},
			},
		);

		store.recordStep(session_id, "filter_init", { table: "patients" });
		store.recordStep(session_id, "filter_add_rule", {
			field: "dept",
			op: "eq",
			value: "$input.dept",
		});

		const compiled = store.stopRecording(
			started.trace_id,
			"Refined macro goal",
			["Applies patient filter"],
		);
		expect(compiled.trace_id).toBe("auto_recorded_macro");
		expect(compiled.goal).toBe("Refined macro goal");
		expect(compiled.steps.length).toBe(2);
		expect(compiled.steps[0]!.id).toBe("filter_init_1");
		expect(compiled.steps[1]!.id).toBe("filter_add_rule_1");
	});

	test("startRecording auto-generates trace_id if omitted and requires trace_id on stopRecording", () => {
		const session_id = "rec-session-auto-id";
		const started = store.startRecording(session_id);
		expect(started.trace_id).toBeDefined();
		expect(started.trace_id.startsWith("trc_")).toBe(true);

		store.recordStep(session_id, "filter_init", {});
		const compiled = store.stopRecording(started.trace_id, "Auto ID Macro");
		expect(compiled.trace_id).toBe(started.trace_id);
		expect(compiled.goal).toBe("Auto ID Macro");
	});

	test("recordStep ignores trace_* meta-tools, *_about, and registered non-recordable tools, while recording state_init and domain tools", () => {
		const session_id = "rec-session-filter-meta";
		store.registerNonRecordableTool("third_party_telemetry");
		const started = store.startRecording(session_id);

		store.recordStep(session_id, "trace_record", { action: "start" });
		store.recordStep(session_id, "state_init", {});
		store.recordStep(session_id, "filter_init", {});
		store.recordStep(session_id, "filter_about", {});
		store.recordStep(session_id, "third_party_telemetry", {});
		store.recordStep(session_id, "trace_inspect", { trace_id: "t1" });

		const compiled = store.stopRecording(started.trace_id);
		expect(compiled.steps.length).toBe(2);
		expect(compiled.steps[0]!.action).toBe("state_init");
		expect(compiled.steps[1]!.action).toBe("filter_init");
	});

	test("input_slots support explicit target step and occurrence locators", () => {
		const compiled = store.recordTrace({
			trace_id: "t_target_locators",
			goal: "Test explicit slot targeting",
			input_slots: {
				first_dept: {
					type: "string",
					description: "Department for first filter call",
					target: {
						action: "filter_add_rule",
						occurrence: 1,
						arg_key: "value",
					},
				},
				second_dept: {
					type: "string",
					description: "Department for second filter call",
					target: {
						action: "filter_add_rule",
						occurrence: 2,
						arg_key: "value",
					},
				},
			},
			steps: [
				{
					id: "rule_1",
					action: "filter_add_rule",
					args: { field: "dept", op: "eq", value: "cardiology" },
				},
				{
					id: "rule_2",
					action: "filter_add_rule",
					args: { field: "dept", op: "eq", value: "neurology" },
				},
			],
		});

		expect(compiled.steps[0]!.args!["value"]).toBe("$input.first_dept");
		expect(compiled.steps[1]!.args!["value"]).toBe("$input.second_dept");
	});

	test("force_parameterize rules defined in tool config promote specific arguments to input slots", () => {
		const customStore = new TraceStore([], {
			filter_add_rule: {
				schema: { _type: "file", path: "schema.json" },
				engine: { _type: "adapter", name: "memory" },
				force_parameterize: ["value", "sensitive_arg"],
			} as any,
		});

		const compiled = customStore.recordTrace({
			trace_id: "t_forced_params",
			goal: "Test force parameterization rules",
			steps: [
				{
					id: "rule_1",
					action: "filter_add_rule",
					args: {
						field: "dept",
						op: "eq",
						value: "cardiology",
						sensitive_arg: "secret_token",
						other_arg: "static_literal",
					},
				},
			],
		});

		expect(compiled.steps[0]!.args!["value"]).toBe("$input.value");
		expect(compiled.steps[0]!.args!["sensitive_arg"]).toBe(
			"$input.sensitive_arg",
		);
		expect(compiled.steps[0]!.args!["other_arg"]).toBe("static_literal"); // Remains static literal
		expect(compiled.input_slots?.["value"]).toBeDefined();
		expect(compiled.input_slots?.["value"]?.default).toBe("cardiology");
	});

	test("refineTrace promotes literal argument to input_slot via promote_arg", () => {
		store.recordTrace({
			trace_id: "t_promote_arg",
			goal: "Test promote_arg refinement",
			steps: [
				{
					id: "s1",
					action: "filter_add_rule",
					args: { field: "dept", op: "eq", value: "cardiology" },
				},
			],
		});

		const refined = store.refineTrace("t_promote_arg", {
			action: "promote_arg",
			step_id: "s1",
			arg_key: "value",
			slot_name: "target_department",
		});

		expect(refined.steps[0]!.args!["value"]).toBe("$input.target_department");
		expect(refined.input_slots?.["target_department"]).toBeDefined();
		expect(refined.input_slots?.["target_department"]?.default).toBe(
			"cardiology",
		);
	});

	test("refineTrace demotes input_slot reference back to static literal via demote_arg", () => {
		store.recordTrace({
			trace_id: "t_demote_arg",
			goal: "Test demote_arg refinement",
			input_slots: {
				target_dept: {
					type: "string",
					description: "Target department",
					default: "cardiology",
				},
			},
			steps: [
				{
					id: "s1",
					action: "filter_add_rule",
					args: { field: "dept", op: "eq", value: "$input.target_dept" },
				},
			],
		});

		const refined = store.refineTrace("t_demote_arg", {
			action: "demote_arg",
			step_id: "s1",
			arg_key: "value",
			literal_value: "cardiology",
		});

		expect(refined.steps[0]!.args!["value"]).toBe("cardiology");
		expect(refined.input_slots?.["target_dept"]).toBeUndefined(); // Cleaned up unreferenced slot
	});
});
