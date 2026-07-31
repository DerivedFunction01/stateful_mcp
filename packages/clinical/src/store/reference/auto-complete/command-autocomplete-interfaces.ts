import type { AutocompleteSuggestion } from "./interfaces";

/**
 * The kind of parser command a suggestion originates from.
 */
export type CommandAutocompleteKind =
	| "tag"
	| "macro"
	| "variable"
	| "slash_command"
	| "term";

/**
 * A single autocomplete suggestion produced by `CommandAutocompleteSuggester`.
 *
 * This is the command-level parallel to `AutocompleteSuggestion` (which is
 * prose-template-scoped). When merged into the unified suggestion list
 * returned by `CdslParser.suggestAutocomplete()`, instances are converted
 * to `AutocompleteSuggestion` format (Option A — see plan).
 */
export interface CommandAutocompleteSuggestion {
	kind: CommandAutocompleteKind;
	insertText: string;
	label: string;
	detail?: string;
	cursorOffset?: number;
	targetSchema?: string;
	rankScore: number;
	nextHints?: AutocompleteSuggestion["nextHints"];
}

/**
 * Context passed into command autocomplete to enable smarter ranking.
 */
export interface CommandAutocompleteContext {
	/** N most recent `ParsedItem.targetSchema` values from the current session */
	recentTargetSchemas?: string[];
	/** Filled template slots (for variable suggestions) */
	filledSlots?: Record<string, unknown>;
	/** Schema → vocabulary namespaces map from `ParserSyntaxProfile.schemaNamespaces` */
	schemaNamespaces?: Record<string, string[]>;
	/** Active profile ID for tag scoping */
	profileId?: string;
	/** Personnel ID for transition store lookups */
	personnelId?: string;
}

/**
 * Options bag for the extended `CdslParser.suggestAutocomplete()`.
 */
export interface SuggestAutocompleteOptions {
	partialText: string;
	commandContext?: CommandAutocompleteContext;
}
