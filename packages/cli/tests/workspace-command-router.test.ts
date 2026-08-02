import { describe, expect, test } from "bun:test";
import { EditorCommandRegistry } from "@stateful-mcp/clinical/session/editor-command-registry";
import { ExtensionRegistry } from "../src/lib/runtime/registry";
import { IntentCatalog } from "../src/lib/runtime/intent-catalog";
import { buildNotebookExtension } from "../src/lib/windows/notebook/extension";

const scope: any = {
	windowKind: "notebook",
	sessionId: "s1",
	collection: { kind: "notebook", collectionId: "s1" },
};

function notebookCatalog(): IntentCatalog {
	const registry = new ExtensionRegistry();
	registry.registerExtension(
		buildNotebookExtension({
			editorDescriptors: EditorCommandRegistry.createDefault().getDescriptors(),
			cellDescriptors: [],
			onCommand: async () => [],
		}),
		scope,
	);
	return new IntentCatalog(registry);
}

describe("P5 — `:workspace` command routing", () => {
	test("notebook catalog recognizes the :workspace verb", () => {
		const catalog = notebookCatalog();
		expect(catalog.findByVerb("workspace", scope)).toBeDefined();
		const intent = catalog.toIntent(":workspace", scope);
		expect(intent).not.toBeNull();
		expect(intent?.id).toBe("command.workspace.workspace");
	});

	test(":gw is registered as a workspace alias and routes to the same intent", () => {
		const catalog = notebookCatalog();
		const gw = catalog.findByVerb("gw", scope);
		expect(gw).toBeDefined();
		const intent = catalog.toIntent(":gw", scope);
		expect(intent).not.toBeNull();
		expect(intent?.id).toBe("command.workspace.workspace");
	});
});
