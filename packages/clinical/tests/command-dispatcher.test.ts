import { describe, expect, test } from "bun:test";
import type { WorkspaceStore } from "../src/engine/workspace-store";
import { CommandDispatcher } from "../src/notebook/command-dispatcher";
import type { Cell } from "../src/session/cell";
import { CellCommandRegistry } from "../src/session/cell-command-registry";
import { EditorCommandRegistry } from "../src/session/editor-command-registry";
import type { ParserSyntaxProfile } from "../src/store/interfaces";

const profile = {
	profileId: "test",
	cellCommandToken: ":",
	cellCommandMappings: { ws: "workspace" },
} as ParserSyntaxProfile;

const cell: Cell = {
	cellId: "cell-1",
	sessionId: "session-1",
	mode: "cdsl",
	rawInput: "",
	routing: { scope: "branch_local", targetSchema: null, branchId: "branch-1" },
	parsedOutput: null,
	workspaceId: "workspace-1",
	status: "draft",
	updatedAt: new Date().toISOString(),
	context: { objects: {} },
};

describe("CommandDispatcher cell context", () => {
	test("passes bootstrap profile and workspace dependencies to cell handlers", async () => {
		const registry = new CellCommandRegistry();
		const workspaceStore = {} as WorkspaceStore;
		let received: { profile?: ParserSyntaxProfile; store?: WorkspaceStore } =
			{};
		registry.register("workspace", async (_command, context) => {
			received = { profile: context.profile, store: context.workspaceStore };
			return {
				success: true,
				workspaceId: "workspace-1",
				workspaceCommands: [{ verb: "close" }],
			};
		});

		const result = await new CommandDispatcher({
			sessionId: "session-1",
			activeCell: cell,
			allCells: [cell],
			editorRegistry: EditorCommandRegistry.createDefault(),
			cellCommandRegistry: registry,
			workspaceStore,
			profile,
		}).dispatch(":ws close");

		expect(received.profile).toBe(profile);
		expect(received.store).toBe(workspaceStore);
		expect(result.success).toBe(true);
		expect(result.data).toEqual({
			workspaceId: "workspace-1",
			workspaceCommands: [{ verb: "close" }],
		});
	});
});
