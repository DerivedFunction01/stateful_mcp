import { EditorAction as ClinicalAction } from "@stateful-mcp/clinical/session/editor-action";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import type { Key } from "ink";
import type {
	DocumentAction,
	DomainAction,
	KeymapPolicy,
	KeyResolution,
} from "./cell-editor";
import { resolveKey } from "./keymap";

/** Classified output of a resolved clinical editor action. */
interface Classification {
	document?: DocumentAction;
	domain?: DomainAction;
	generic?: "ENTER_INSERT" | "ENTER_COMMAND" | "CANCEL";
	char?: string;
}

function classify(action: ClinicalAction): Classification {
	switch (action) {
		case ClinicalAction.MoveUp:
			return { document: { type: "move", delta: -1 } };
		case ClinicalAction.MoveDown:
			return { document: { type: "move", delta: 1 } };
		case ClinicalAction.InsertBelow:
			return { document: { type: "insertBelow" } };
		case ClinicalAction.InsertAbove:
			return { document: { type: "insertAbove" } };
		case ClinicalAction.DeleteCell:
			return { document: { type: "deleteActive" } };
		case ClinicalAction.YankCell:
			return { document: { type: "yankActive" } };
		case ClinicalAction.PasteCell:
			return { document: { type: "paste" } };
		case ClinicalAction.Undo:
			return { document: { type: "undo" } };
		case ClinicalAction.Redo:
			return { document: { type: "redo" } };
		case ClinicalAction.EnterVisualMode:
			return { document: { type: "enterVisual" } };
		case ClinicalAction.ExtendSelectionDown:
			return { document: { type: "extendSelection", delta: 1 } };
		case ClinicalAction.ExtendSelectionUp:
			return { document: { type: "extendSelection", delta: -1 } };
		case ClinicalAction.SwapSelectionAnchor:
			return { document: { type: "swapAnchor" } };
		case ClinicalAction.DeleteSelection:
			return { document: { type: "deleteSelection" } };
		case ClinicalAction.YankSelection:
			return { document: { type: "yankSelection" } };
		case ClinicalAction.PrevError:
			return { document: { type: "prevError" } };
		case ClinicalAction.NextError:
			return { document: { type: "nextError" } };
		case ClinicalAction.RunCell:
			return { domain: { type: "run" } };
		case ClinicalAction.PreviewCell:
			return { domain: { type: "preview" } };
		case ClinicalAction.EnterInsertMode:
			return { generic: "ENTER_INSERT" };
		case ClinicalAction.ExitInsertMode:
			return { generic: "CANCEL" };
		case ClinicalAction.ExitVisualMode:
			return { generic: "CANCEL" };
		case ClinicalAction.OpenCommandLine:
			return { generic: "ENTER_COMMAND" };
		case ClinicalAction.OpenWorkspace:
			return { domain: { type: "openWorkspace" } };
		case ClinicalAction.Info:
			return { domain: { type: "showInfo" } };
		case ClinicalAction.Quit:
			return { domain: { type: "quit" } };
		default:
			return {};
	}
}

export class NotebookKeymapPolicy implements KeymapPolicy {
	resolve(
		input: string,
		key: Key,
		mode: EditorMode,
		pending: string,
	): KeyResolution {
		const { action, nextPending, char } = resolveKey(input, key, mode, pending);

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
			return { kind: "generic", action: { type: classified.generic } };
		}
		return { kind: "none", nextPending: "" };
	}
}
