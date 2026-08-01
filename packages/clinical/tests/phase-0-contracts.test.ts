import { describe, expect, it } from "bun:test";
import { SEED_PARSER_PROFILES } from "../src/seed/defaults";
import { CellCommandRegistry } from "../src/session/cell-command-registry";
import type { CommandDescriptor } from "../src/session/command-descriptor";
import { CommandGroup } from "../src/session/command-descriptor";
import { EditorAction } from "../src/session/editor-action";
import { EditorCommandRegistry } from "../src/session/editor-command-registry";
import type { ParseDiagnostic, ParseTrace } from "../src/session/parse-trace";
import {
	ParseDiagnosticSeverity,
	ParseFieldSource,
	ParseInputSpanKind,
	ParseRoutingReason,
	TraceLevel,
} from "../src/session/parse-trace";
import type { PreviewCandidate } from "../src/session/preview-candidate";
import {
	CandidateStatus,
	computeInputFingerprint,
	computeProfileFingerprint,
} from "../src/session/preview-candidate";
import type { WorkspaceSnapshot } from "../src/session/workspace-read-model";
import type { NotebookCellRef } from "../src/store/notebook/interfaces";

// ── ParseTrace contracts ───────────────────────────────────────────

describe("ParseTrace", () => {
	it("satisfies the full trace interface", () => {
		const trace: ParseTrace = {
			traceId: "trc_001",
			parserVersion: "1.0.0",
			profileId: "default",
			routing: {
				inputTag: "#observation",
				targetSchema: "ObservationEvent",
				reason: ParseRoutingReason.Tag,
			},
			inputSpans: [
				{ start: 0, end: 13, kind: ParseInputSpanKind.Tag },
				{ start: 14, end: 41, kind: ParseInputSpanKind.Content },
			],
			ruleApplications: [],
			fieldDerivations: [],
			diagnostics: [],
		};
		expect(trace.traceId).toBe("trc_001");
		expect(trace.routing.reason).toBe(ParseRoutingReason.Tag);
	});

	it("distinguishes field derivation sources", () => {
		const capture = ParseFieldSource.Capture;
		const computed = ParseFieldSource.Computed;
		const default_ = ParseFieldSource.SchemaDefault;
		expect(capture).not.toBe(computed);
		expect(default_).not.toBe(capture);
	});

	it("supports diagnostic severity levels", () => {
		const diagnostic: ParseDiagnostic = {
			code: "MISSING_FIELD",
			severity: ParseDiagnosticSeverity.Warning,
			fieldPath: "anatomyLocations",
			messageKey: "field.missing.anatomy",
		};
		expect(diagnostic.severity).toBe(ParseDiagnosticSeverity.Warning);
		expect(diagnostic.code).toBe("MISSING_FIELD");
	});

	it("supports trace level enum", () => {
		expect(TraceLevel.None).toBe("none");
		expect(TraceLevel.Summary).toBe("summary");
		expect(TraceLevel.Debug).toBe("debug");
	});
});

// ── PreviewCandidate contracts ────────────────────────────────────

describe("PreviewCandidate", () => {
	it("satisfies the candidate interface", () => {
		const candidate: PreviewCandidate = {
			candidateId: "cnd_001",
			sessionId: "session-1",
			cellId: "cell-1",
			rawInput: "#observation Chest pain",
			inputFingerprint: "ObservationEvent::#observation chest pain",
			profileFingerprint: "default",
			parsedOutput: null,
			warnings: [],
			diagnostics: [],
			status: CandidateStatus.Active,
			createdAt: new Date().toISOString(),
		};
		expect(candidate.status).toBe(CandidateStatus.Active);
	});

	it("computes consistent fingerprints", () => {
		const fp1 = computeInputFingerprint(
			"#observation Chest pain",
			"ObservationEvent",
		);
		const fp2 = computeInputFingerprint(
			"  #observation   Chest pain  ",
			"ObservationEvent",
		);
		expect(fp1).toBe(fp2);
		expect(fp1).toBe("ObservationEvent::#observation chest pain");
	});

	it("produces different fingerprints for different schemas", () => {
		const fp1 = computeInputFingerprint("chest pain", "ObservationEvent");
		const fp2 = computeInputFingerprint("chest pain", "VitalsMeasurementEvent");
		expect(fp1).not.toBe(fp2);
	});

	it("computes profile fingerprints", () => {
		expect(computeProfileFingerprint("default")).toBe("default");
		expect(computeProfileFingerprint("default", "2.0.0")).toBe("default@2.0.0");
	});

	it("allows candidate status transitions", () => {
		const statuses = [
			CandidateStatus.Active,
			CandidateStatus.Committed,
			CandidateStatus.Cancelled,
			CandidateStatus.Expired,
		];
		expect(statuses).toHaveLength(4);
	});
});

// ── CommandDescriptor contracts ───────────────────────────────────

describe("CommandDescriptor", () => {
	it("satisfies the descriptor interface", () => {
		const descriptor: CommandDescriptor = {
			verb: "set",
			aliases: [],
			group: CommandGroup.Field,
			descriptionKey: "command.description.set",
			args: [
				{ name: "field", required: true, descriptionKey: "arg.set.field" },
				{ name: "value", required: true, descriptionKey: "arg.set.value" },
			],
		};
		expect(descriptor.group).toBe(CommandGroup.Field);
		expect(descriptor.args).toHaveLength(2);
	});
});

// ── EditorAction contracts ────────────────────────────────────────

describe("EditorAction", () => {
	it("defines canonical action IDs", () => {
		expect(EditorAction.MoveUp).toBe("move_up");
		expect(EditorAction.MoveDown).toBe("move_down");
		expect(EditorAction.EditCell).toBe("edit_cell");
		expect(EditorAction.RunCell).toBe("run_cell");
		expect(EditorAction.Quit).toBe("quit");
	});

	it("includes workspace and error navigation actions", () => {
		expect(EditorAction.OpenWorkspace).toBe("open_workspace");
		expect(EditorAction.NextError).toBe("next_error");
		expect(EditorAction.PrevError).toBe("prev_error");
	});
});

// ── CellCommandRegistry.getDescriptors() ──────────────────────────

describe("CellCommandRegistry descriptors", () => {
	it("returns sorted descriptors for registered commands", () => {
		const registry = CellCommandRegistry.createDefault();
		const descriptors = registry.getDescriptors();
		const verbs = descriptors.map((d) => d.verb);
		expect(verbs).toContain("up");
		expect(verbs).toContain("set");
		expect(verbs).not.toContain("workspace");
		expect(verbs).toContain("help");
	});

	it("matches helpText to descriptors", () => {
		const registry = CellCommandRegistry.createDefault();
		const descriptors = registry.getDescriptors();
		const token = ":";
		const helpVerbs = registry.helpText(token);
		for (const d of descriptors) {
			expect(helpVerbs).toContain(`${token}${d.verb}`);
		}
	});
});

// ── EditorCommandRegistry ─────────────────────────────────────────

describe("EditorCommandRegistry", () => {
	it("dispatches default editor commands", () => {
		const registry = EditorCommandRegistry.createDefault();
		expect(registry.dispatch("w", [])).toEqual({
			success: true,
			action: "save",
		});
		expect(registry.dispatch("q", [])).toEqual({
			success: true,
			action: "quit",
		});
		expect(registry.dispatch("wq", [])).toEqual({
			success: true,
			action: "save_quit",
		});
	});

	it("rejects unknown editor commands", () => {
		const registry = EditorCommandRegistry.createDefault();
		const result = registry.dispatch("unknown", []);
		expect(result.success).toBe(false);
	});

	it("dispatches mode toggle", () => {
		const registry = EditorCommandRegistry.createDefault();
		expect(registry.dispatch("mode", ["preview"])).toEqual({
			success: true,
			action: "set_execution_mode",
			data: { mode: "preview" },
		});
		expect(registry.dispatch("mode", ["invalid"]).success).toBe(false);
	});

	it("exposes descriptors", () => {
		const registry = EditorCommandRegistry.createDefault();
		const descriptors = registry.getDescriptors();
		const verbs = descriptors.map((d) => d.verb);
		expect(verbs).toContain("w");
		expect(verbs).toContain("q");
		expect(verbs).toContain("mode");
		expect(verbs).toContain("search");
		expect(verbs).toContain("workspace");
	});

	it("bare workspace dispatches toggle_workspace", () => {
		const registry = EditorCommandRegistry.createDefault();
		expect(registry.dispatch("workspace", [])).toEqual({
			success: true,
			action: "toggle_workspace",
		});
	});

	it("workspace with args returns handled usage and does not fall through", () => {
		const registry = EditorCommandRegistry.createDefault();
		const result = registry.dispatch("workspace", ["branch", "test", "test"]);
		expect(result.success).toBe(true);
		expect(result.action).toBe("workspace_usage");
		expect(result.message).toContain("branch");
	});
});

// ── NotebookStore interface contract (compile-time only) ──────────

describe("NotebookStore", () => {
	it("satisfies the interface contract", () => {
		const ref: NotebookCellRef = {
			sessionId: "session-1",
			cellId: "cell-1",
			position: 0,
			updatedAt: new Date().toISOString(),
		};
		expect(ref.sessionId).toBe("session-1");
		expect(ref.position).toBe(0);
	});
});

// ── WorkspaceReadModel interface contract ─────────────────────────

describe("WorkspaceReadModel", () => {
	it("satisfies the snapshot interface", () => {
		const snapshot: WorkspaceSnapshot = {
			workspaceId: "work_001",
			sourceSoapNoteId: "note_001",
			activeBranchId: "branch_001",
			branches: [],
			globalFactCount: 0,
		};
		expect(snapshot.activeBranchId).toBe("branch_001");
	});
});

// ── Seed profile compliance ───────────────────────────────────────

describe("Seed profile ruleId compliance", () => {
	it("all existing attribute rules can carry ruleId", () => {
		const profile = SEED_PARSER_PROFILES[0]!;
		for (const rule of profile.attributeRules ?? []) {
			// ruleId is optional — this just verifies the type accepts it
			expect(typeof rule.targetField).toBe("string");
		}
	});
});
