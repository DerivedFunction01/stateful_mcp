import type { CommandDescriptorDto } from "./commands";
import type { EditorMode } from "./editor";
import type {
	DiagnosticDto,
	KeymapBindingDto,
	KeymapBindingSource,
} from "./workspace";

/**
 * Host-projected command catalog for the browser command palette. Only
 * host-authoritative fields are included; search query and selection are
 * browser presentation state.
 */
export interface CommandPaletteSnapshotDto {
	readonly commands: readonly CommandDescriptorDto[];
	readonly activeContext: string;
	readonly keymapProfileId: string;
	readonly diagnostics: readonly DiagnosticDto[];
}

/**
 * Discriminated union of commands routed through the host `/commands` endpoint.
 * `command.execute` is the canonical Macro command runner. `keymap.profile.select`
 * switches the active keymap profile for the calling session only.
 * `keymap.binding.resolve` asks the host to resolve a normalized chord against
 * the canonical keymap matcher for the active context.
 */
export type CommandOperation =
	| {
			readonly type: "command.execute";
			readonly command: string;
			readonly args?: readonly unknown[];
			readonly expectedRevision?: number;
	  }
	| {
			readonly type: "keymap.profile.select";
			readonly profileId: string;
	  }
	| {
			readonly type: "keymap.binding.resolve";
			readonly chord: string;
			readonly context: KeymapBindingContextDto;
	  };

export interface KeymapBindingContextDto {
	readonly activeTabId?: string;
	readonly activeDocumentId?: string;
	readonly focusedPane?: string;
	readonly focusedRegion?: string;
	readonly editorMode?: EditorMode;
	readonly textInputOwner?: string;
	readonly [key: string]: string | boolean | undefined;
}

/** Result of a host-side keymap binding resolution. */
export interface KeymapBindingResolutionDto {
	readonly chord: string;
	readonly command?: string;
	readonly source?: KeymapBindingSource;
	readonly replacedBinding?: string;
	readonly diagnostics: readonly DiagnosticDto[];
}

/**
 * Renderer-neutral matcher for an already projected effective keymap. This is
 * intentionally kept in the dependency-free protocol package so browser code
 * does not import Macro's Bun/runtime implementation.
 */
export function matchEffectiveBindings(
	bindings: readonly KeymapBindingDto[],
	chord: string,
	mode?: string,
	context: Readonly<Record<string, string | boolean | undefined>> = {},
): KeymapBindingDto | undefined {
	const normalized = normalizeSemanticChord(chord);
	const finalChord = normalized.includes(" ")
		? normalized.slice(normalized.lastIndexOf(" ") + 1)
		: normalized;
	return bindings.find(
		(binding) =>
			(!binding.modes || mode === undefined || binding.modes.includes(mode)) &&
			contextMatches(binding.when, context) &&
			binding.chords.some(
				(candidate) => normalizeSemanticChord(candidate) === finalChord,
			),
	);
}

/** Normalize only spelling/semantic aliases; explicit `meta` remains explicit. */
export function normalizeSemanticChord(chord: string): string {
	return chord
		.trim()
		.toLowerCase()
		.split(/\s+/u)
		.map((sequence) =>
			sequence
				.split("+")
				.map((token) => token.trim())
				.filter(Boolean)
				.join("+"),
		)
		.join(" ");
}

export function contextMatches(
	expression: unknown,
	context: Readonly<Record<string, string | boolean | undefined>>,
): boolean {
	if (!expression || typeof expression !== "object") return true;
	const value = expression as {
		key?: string;
		equals?: string | boolean;
		allOf?: readonly unknown[];
		anyOf?: readonly unknown[];
		not?: unknown;
	};
	if (value.key) return String(context[value.key]) === String(value.equals);
	if (value.allOf)
		return value.allOf.every((item) => contextMatches(item, context));
	if (value.anyOf)
		return value.anyOf.some((item) => contextMatches(item, context));
	if (value.not) return !contextMatches(value.not, context);
	return true;
}
