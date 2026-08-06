import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { Key } from "ink";
import type {
	DocumentAction,
	DomainAction,
	KeymapPolicy,
	KeyResolution,
} from "../../editor";
import { EditorAction as ClinicalAction } from "../../editor/editor-action";
import type { EditorKeymapProfile } from "../../editor/editor-keymap-profile";
import { resolveKey } from "../../editor/keymap";

/** Classified output of a resolved clinical editor action. */
interface Classification {
	document?: DocumentAction;
	domain?: DomainAction;
	generic?:
		| "ENTER_INSERT"
		| "ENTER_COMMAND"
		| "ENTER_MACRO"
		| "CANCEL"
		| "SEARCH"
		| "OPEN_HISTORY"
		| "TOGGLE_SIDEBAR"
		| "SUBMIT_MACRO";
	char?: string;
}

function classify(action: ClinicalAction): Classification {
	switch (action) {
		case ClinicalAction.MoveUp:
			return { document: { type: "move", delta: -1 } };
		case ClinicalAction.MoveDown:
			return { document: { type: "move", delta: 1 } };
		case ClinicalAction.InsertBelow:
			return { generic: "ENTER_MACRO" };
		case ClinicalAction.InsertAbove:
			return { generic: "ENTER_MACRO" };
		case ClinicalAction.DeleteCell:
			return {};
		case ClinicalAction.YankCell:
			return {};
		case ClinicalAction.PasteCell:
			return {};
		case ClinicalAction.PasteCellAbove:
			return {};
		case ClinicalAction.Undo:
			return { document: { type: "undo" } };
		case ClinicalAction.Redo:
			return {};
		case ClinicalAction.EnterVisualMode:
			return { document: { type: "enterVisual" } };
		case ClinicalAction.ExtendSelectionDown:
			return { document: { type: "extendSelection", delta: 1 } };
		case ClinicalAction.ExtendSelectionUp:
			return { document: { type: "extendSelection", delta: -1 } };
		case ClinicalAction.SwapSelectionAnchor:
			return { document: { type: "swapAnchor" } };
		case ClinicalAction.DeleteSelection:
			return {};
		case ClinicalAction.YankSelection:
			return {};
		case ClinicalAction.PrevError:
			return { document: { type: "prevError" } };
		case ClinicalAction.NextError:
			return { document: { type: "nextError" } };
		case ClinicalAction.RunCell:
			return {};
		case ClinicalAction.PreviewCell:
			return {};
		case ClinicalAction.EnterInsertMode:
			return { generic: "ENTER_MACRO" };
		case ClinicalAction.ExitInsertMode:
			return { generic: "CANCEL" };
		case ClinicalAction.ExitVisualMode:
			return { generic: "CANCEL" };
		case ClinicalAction.OpenCommandLine:
			return { generic: "ENTER_COMMAND" };
		case ClinicalAction.OpenMacroInput:
			return { generic: "ENTER_MACRO" };
		case ClinicalAction.SubmitMacro:
			return { generic: "SUBMIT_MACRO" };
		case ClinicalAction.OpenWorkspace:
			return { domain: { type: "openWorkspace" } };
		case ClinicalAction.Info:
			return { generic: "TOGGLE_SIDEBAR" };
		case ClinicalAction.Quit:
			return { domain: { type: "quit" } };
		case ClinicalAction.Search:
			return { generic: "SEARCH" };
		case ClinicalAction.OpenHistory:
			return { generic: "OPEN_HISTORY" };
		default:
			throw new Error(`Unclassified editor action: ${action}`);
	}
}

export class NotebookKeymapPolicy implements KeymapPolicy {
	constructor(private readonly profile: EditorKeymapProfile) {}

	resolve(
		input: string,
		key: Key,
		mode: EditorMode,
		pending: string,
		commandKind?: "macro" | "direct" | "variable",
	): KeyResolution {
		const { action, nextPending, char } = resolveKey(
			input,
			key,
			mode,
			pending,
			this.profile,
			commandKind,
		);
		if (action === ClinicalAction.EnterInsertMode && key.return)
			return { kind: "none", nextPending: "" };

		// Multi-key sequence awaiting a second key (dd, yy, [e, gw, ...).
		if (action === null && nextPending) {
			return { kind: "none", nextPending };
		}
		if (action === null) {
			return { kind: "none", nextPending: "" };
		}
		if (char !== undefined) {
			return { kind: "generic", action: { type: "INSERT_TEXT", text: char } };
		}
		if (action === ClinicalAction.Backspace) {
			return {
				kind: "generic",
				action: { type: "BACKSPACE" },
			};
		}

		const classified = classify(action);
		if (classified.document) {
			return { kind: "document", action: classified.document };
		}
		if (classified.domain) {
			return { kind: "domain", action: classified.domain };
		}
		if (classified.generic) {
			return {
				kind: "generic",
				action: { type: classified.generic },
			};
		}
		return { kind: "none", nextPending: "" };
	}
}
