import type { ReactNode } from "react";
import type { EditorKeymapProfile, MacroWorkspace } from "@stateful-mcp/macro";

export interface TerminalSize {
	readonly columns: number;
	readonly rows: number;
}

export interface TuiStoryContext {
	readonly storyId: string;
	readonly stateId: string;
	readonly size: TerminalSize;
	readonly workspace: MacroWorkspace;
	readonly keymap: EditorKeymapProfile;
	readonly focusTarget?: string;
	readonly showBounds: boolean;
}

export interface TuiStory {
	readonly id: string;
	readonly title: string;
	readonly category?: "Core" | "Scratchpad" | "Primitives" | "Modals" | "Views" | "Extensions";
	readonly ownerExtensionId?: string;
	readonly states: readonly string[];
	readonly sizes?: readonly TerminalSize[];
	render(context: TuiStoryContext): ReactNode;
}

export interface TuiStoryContribution {
	readonly id: string;
	readonly ownerExtensionId: string;
	readonly title: string;
	readonly category?: string;
	readonly states: readonly string[];
	render(context: TuiStoryContext): ReactNode;
}
