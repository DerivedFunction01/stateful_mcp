/**
 *  cell-intent contracts.
 *
 * The discriminated union that classifies authored raw text into a typed,
 * compilable intent. Macro is the primary path; workspace commands and
 * narrative writes are separate typed intents. A UI/editor mode is NOT part of
 * the domain execution intent.
 */

import type { VariableStatement } from "@stateful-mcp/core";
import type { DirectCommandVerb } from "../commands/command-syntax-profile";
import type {
	MacroArgumentInput,
	MacroSourceLine,
} from "../macros/macro-binding";

/** Typed workspace command payload (-local; workspace service compiles it). */
export interface WorkspaceCommandIntentPayload {
	verb: DirectCommandVerb;
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

export interface VariableIntent {
	kind: "variable";
	statement: VariableStatement;
}

export type CellIntent =
	| MacroIntent
	| WorkspaceCommandIntent
	| NarrativeIntent
	| VariableIntent;
