import type { StructuredCell } from "@stateful-mcp/clinical/cells/structured-cell";
import type { AutocompleteSuggestion } from "../editor/autocomplete";
import type { CommandDescriptor } from "../editor/command-descriptor";
import type { NotebookEditorMode as EditorMode } from "@stateful-mcp/clinical/notebook/notebook-state";
import type { Key } from "ink";
import type { ReactElement } from "react";
import type { DocumentAction, EditorAction } from "../editor";
import type { CompletionState } from "../editor/completion-state";

// ── Capabilities ─────────────────────────────────────────────────────────────

export type CapabilityId =
	| "cell.edit"
	| "cell.navigate"
	| "cell.run"
	| "cell.preview"
	| "cell.undo"
	| "cell.visual"
	| "cell.search"
	| "command.history"
	| "workspace.branch"
	| "workspace.variable"
	| "plan.step"
	| "plan.sidebar"
	| (string & {});

// ── Window scope ─────────────────────────────────────────────────────────────

export interface WindowScope {
	windowKind: string;
	sessionId: string;
	collection: StructuredCell["collection"];
	activeBranchId?: string;
}

// ── Intents ──────────────────────────────────────────────────────────────────

export type IntentSource =
	| "keybinding"
	| "commandLine"
	| "cell"
	| "completion"
	| "system";

export interface WindowIntent {
	id: string;
	source: IntentSource;
	scope: WindowScope;
	arguments: Record<string, unknown>;
	rawInput?: string;
	originCellId?: string;
	correlationId: string;
}

// ── Effects ──────────────────────────────────────────────────────────────────

export type WindowEffect =
	| { type: "document.dispatch"; action: DocumentAction }
	| { type: "editor.dispatch"; action: EditorAction }
	| {
			type: "router.open";
			route: "help" | "preview" | "info" | "search";
			payload?: unknown;
	  }
	| { type: "router.close" }
	| { type: "router.switchWindow"; windowKind: string }
	| { type: "editor.message"; message: string }
	| { type: "editor.mode"; mode: "execute" | "preview" }
	| {
			type: "editor.defaultInsert";
			section: string;
			schema: string | null;
	  }
	| { type: "editor.completion"; completion: CompletionState }
	| { type: "app.quit" };

// ── Contributions ────────────────────────────────────────────────────────────

export type CommandSource = "editor" | "cell" | "window";

export interface CommandArgument {
	name: string;
	required: boolean;
	descriptionKey?: string;
	completions?: string[];
	completionKind?: string;
}

export interface CommandContribution {
	id: string;
	intentType: string;
	aliases: string[];
	args: CommandArgument[];
	source: CommandSource;
	/** Whether executing this produces a durable cell/side effect. */
	durable: boolean;
	/** Whether this is a transient UI action (help, back, exit). */
	transientUi?: boolean;
	capability?: CapabilityId;
	descriptionKey: string;
	group: string;
}

export interface KeybindingContribution {
	id: string;
	key: string;
	modifiers?: string[];
	modes: EditorMode[];
	intentType: string;
	when?: (scope: WindowScope) => boolean;
	priority?: number;
	/** Multi-key sequence support: key sequences that resolve only on a second key. */
	sequence?: string[];
}

export interface CompletionContribution {
	id: string;
	/** Comma-free verb group this applies to, or a predicate on the partial. */
	verbs?: string[];
	match?: (partial: string, scope: WindowScope) => boolean;
	getSuggestions(partial: string, scope: WindowScope): AutocompleteSuggestion[];
}

export interface RegionContribution {
	id: string;
	slot: "primary" | "command" | "status" | "footer" | "sidebar";
	order?: number;
	visibleWhen?: (scope: WindowScope) => boolean;
	render(context: WindowExtensionContext): ReactElement | null;
}

export interface IntentHandler {
	id: string;
	intentTypes: string[];
	handle(
		intent: WindowIntent,
		context: WindowExtensionContext,
	): Promise<WindowEffect[]> | WindowEffect[];
}

export interface EffectHandler {
	id: string;
	effectTypes: string[];
	handle(
		effect: WindowEffect,
		context: WindowExtensionContext,
	): void | Promise<void>;
}

// ── Extension context ────────────────────────────────────────────────────────

export interface WindowExtensionContext {
	scope: WindowScope;
	editorState: EditorKernelStateLike;
	document: DocumentServices;
	services: Record<string, unknown>;
}

export interface EditorKernelStateLike {
	mode: EditorMode;
	draftText: string;
	completion: CompletionState;
	error: string | null;
	showHelp: boolean;
}

export interface DocumentServices {
	getView(): {
		cells: StructuredCell[];
		activeIndex: number;
		selection?: { start: number; end: number } | null;
	};
	dispatch(action: DocumentAction): void;
}

// ── Extension ────────────────────────────────────────────────────────────────

export interface ExtensionContribution {
	commands?: CommandContribution[];
	keybindings?: KeybindingContribution[];
	completion?: CompletionContribution[];
	regions?: RegionContribution[];
	intentHandlers?: IntentHandler[];
	effectHandlers?: EffectHandler[];
}

export interface EditorExtension extends ExtensionContribution {
	id: string;
	windows: string[];
	description?: string;
	activate?(context: WindowExtensionContext): ExtensionContribution | undefined;
	dispose?(): void;
}

// ── Registry API ─────────────────────────────────────────────────────────────

export interface KeyInput {
	input: string;
	key: Key;
	mode: EditorMode;
	pending: string;
}

export function makeIntent(
	id: string,
	source: IntentSource,
	scope: WindowScope,
	args: Record<string, unknown> = {},
	extra: Partial<WindowIntent> = {},
): WindowIntent {
	return {
		id,
		source,
		scope,
		arguments: args,
		correlationId: crypto.randomUUID(),
		...extra,
	};
}

export function commandDescriptorFromContribution(
	c: CommandContribution,
): CommandDescriptor {
	return {
		verb: c.id,
		aliases: c.aliases,
		group: c.group as any,
		descriptionKey: c.descriptionKey,
		args: c.args.map((a) => ({
			name: a.name,
			required: a.required,
			descriptionKey: a.descriptionKey ?? "arg.description",
			completions: a.completions,
		})),
	};
}
