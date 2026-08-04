import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { Key } from "ink";
import type { KeymapPolicy, KeyResolution } from "../../editor";
import { NotebookKeymapPolicy } from "../notebook/keymap-policy";

/**
 * Workspace key policy. Cell editing remains shared with the notebook, but
 * window-navigation actions are scoped to the current window and therefore do
 * not reopen the workspace from inside itself.
 */
export class WorkspaceKeymapPolicy implements KeymapPolicy {
	private readonly shared = new NotebookKeymapPolicy();

	resolve(
		input: string,
		key: Key,
		mode: EditorMode,
		pending: string,
	): KeyResolution {
		const resolution = this.shared.resolve(input, key, mode, pending);
		if (
			resolution.kind === "domain" &&
			resolution.action.type === "openWorkspace"
		) {
			return { kind: "none", nextPending: "" };
		}
		return resolution;
	}
}
