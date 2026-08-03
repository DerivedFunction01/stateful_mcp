/**
 * V2 cell-intent contracts.
 *
 * The discriminated union that classifies authored raw text into a typed,
 * compilable intent. Macro is the primary path; workspace commands and
 * narrative writes are separate typed intents. A UI/editor mode is NOT part of
 * the domain execution intent.
 */

import type { MacroSourceLine, MacroArgumentInput } from "../macros/macro-binding";

export type WorkspaceCommandVerb =
	| "branch"
	| "rule_out"
	| "confirm"
	| "suspend"
	| "re_activate"
	| "elevate"
	| "close";

/** Typed workspace command payload (V2-local; workspace service compiles it). */
export interface WorkspaceCommandIntentPayload {
	verb: WorkspaceCommandVerb;
	branchName?: string;
	branchRef?: string;
	conceptRef?: string;
	delta?: number;
}

export interface MacroIntent {
	kind: "macro";
	macroName: string;
	arguments: MacroArgumentInput[];
	sourceLines: MacroSourceLine[];
}

export interface WorkspaceCommandIntent {
	kind: "workspace_command";
	command: WorkspaceCommandIntentPayload;
}

export interface NarrativeIntent {
	kind: "narrative";
	target: { schema: string; path: string };
	value: string;
}

export type CellIntent = MacroIntent | WorkspaceCommandIntent | NarrativeIntent;
