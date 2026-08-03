import { describe, expect, it } from "bun:test";
import { createCommandSyntaxProfile } from "../src/commands/command-syntax-profile";
import { parseDirectCommand } from "../src/commands/direct-command-parser";

const workspace = {
	id: "ws-1",
	branches: [
		{
			id: "branch-1",
			commandAlias: "b1",
			name: "Primary",
			hypothesisConcept: { conceptId: "C1", display: "Pneumonia" },
		},
		{
			id: "branch-2",
			commandAlias: "b2",
			name: "Alternative",
			hypothesisConcept: { conceptId: "C2", display: "Bronchitis" },
		},
	],
};

const context = {
	getWorkspace: async () => workspace,
	resolveBranchRef: (aggregate: typeof workspace, ref: string) => {
		const branch = aggregate.branches.find(
			(item) =>
				item.id === ref || item.commandAlias === ref || item.name === ref,
		);
		if (!branch)
			throw Object.assign(new Error("branch not found"), {
				diagnosticCode: "missing_branch",
			});
		return { id: branch.id };
	},
};

describe(" direct command-bar parser", () => {
	it("compiles confirmation into a typed workspace operation", async () => {
		const intent = await parseDirectCommand(
			{
				rawText: ":confirm b1",
				sessionId: "s1",
				workspaceId: "ws-1",
				actorId: "user-1",
			},
			context,
		);
		expect(intent.kind).toBe("workspace_operation");
		expect(intent.operation).toEqual({
			kind: "branch_transition",
			workspaceId: "ws-1",
			branchId: "branch-1",
			transition: "confirm",
			actorId: "user-1",
		});
	});

	it("compiles completion and preserves source cell provenance", async () => {
		const intent = await parseDirectCommand(
			{
				rawText: ":complete Primary",
				sessionId: "s1",
				workspaceId: "ws-1",
				cellId: "cell-1",
			},
			context,
		);
		expect(intent.operation).toEqual({
			kind: "complete",
			workspaceId: "ws-1",
			winningBranchId: "branch-1",
		});
		expect(intent.cellId).toBe("cell-1");
	});

	it("returns structured diagnostics for missing context and invalid references", async () => {
		const missing = await parseDirectCommand(
			{ rawText: ":close", sessionId: "s1" },
			context,
		);
		expect(missing.diagnostics[0]?.code).toBe("missing_context");

		const invalid = await parseDirectCommand(
			{ rawText: ":confirm unknown", sessionId: "s1", workspaceId: "ws-1" },
			context,
		);
		expect(invalid.diagnostics[0]?.code).toBe("missing_context");
	});

	it("requires a concept for new branches", async () => {
		const intent = await parseDirectCommand(
			{ rawText: ":branch New", sessionId: "s1", workspaceId: "ws-1" },
			context,
		);
		expect(intent.kind).toBe("unsupported");
		expect(intent.diagnostics[0]?.code).toBe("invalid_argument");
	});

	it("uses configured command tokens and aliases", async () => {
		const profile = createCommandSyntaxProfile({
			profileId: "custom",
			directCommandToken: "/",
			directCommandMappings: { ok: "confirm" },
		});
		const intent = await parseDirectCommand(
			{ rawText: "/ok b1", sessionId: "s1", workspaceId: "ws-1" },
			context,
			profile,
		);
		expect(intent.kind).toBe("workspace_operation");
		expect(intent.operation).toMatchObject({
			kind: "branch_transition",
			transition: "confirm",
			branchId: "branch-1",
		});
	});
});
