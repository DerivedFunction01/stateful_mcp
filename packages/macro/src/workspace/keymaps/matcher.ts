import {
	contextMatches as matchSharedContext,
	matchEffectiveBindings as matchSharedEffectiveBindings,
} from "@stateful-mcp/macro-protocol/keymap";
import type { KeymapBindingDto } from "@stateful-mcp/macro-protocol/workspace";
import type { ContextExpression } from "../contributions/types";
import { DEFAULT_COMMAND_KEYBINDINGS } from "./defaults";
import {
	ALL_CANONICAL_KEYS,
	type CanonicalKey,
	type EditorKeymapProfile,
	type KeyChordValue,
	type KeymapContext,
	type WorkspaceKeybinding,
} from "./types";

export interface KeyInputEvent {
	readonly char?: string;
	readonly name?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	/** Semantic platform-primary modifier, when supplied by the input adapter. */
	readonly primary?: boolean;
	/** Active platform used to map a physical Ctrl/Meta event to `primary`. */
	readonly platform?: "mac" | "windows" | "linux" | "unknown";
	readonly shift?: boolean;
}

export interface ParsedKeyChord {
	readonly ctrl: boolean;
	readonly meta: boolean;
	readonly primary: boolean;
	readonly shift: boolean;
	readonly key: CanonicalKey;
}

const TERMINAL_KEY_MAP: Readonly<Record<string, CanonicalKey>> = {
	return: "enter",
	enter: "enter",
	"\r": "enter",
	"\n": "enter",
	escape: "escape",
	"\x1b": "escape",
	tab: "tab",
	"\t": "tab",
	"\x1b[z": "tab",
	backspace: "backspace",
	"\b": "backspace",
	"\x7f": "backspace",
	delete: "delete",
	uparrow: "up",
	up: "up",
	downarrow: "down",
	down: "down",
	leftarrow: "left",
	left: "left",
	rightarrow: "right",
	right: "right",
	pageup: "pageup",
	page_up: "pageup",
	pagedown: "pagedown",
	page_down: "pagedown",
	home: "home",
	end: "end",
	"\x01": "a",
	"\x02": "b",
	"\x03": "c",
	"\x04": "d",
	"\x05": "e",
	"\x06": "f",
	"\x07": "g",
	"\x0b": "k",
	"\x0c": "l",
	"\x0e": "n",
	"\x0f": "o",
	"\x10": "p",
	"\x11": "q",
	"\x12": "r",
	"\x13": "s",
	"\x14": "t",
	"\x15": "u",
	"\x16": "v",
	"\x17": "w",
	"\x18": "x",
	"\x19": "y",
	"\x1a": "z",
};

/**
 * Strict parser for canonical key chords.
 * Follows the grammar: [ctrl+][meta+][primary+][shift+]<canonical_key> or single character (including uppercase for Shift).
 */
export function parseChord(chord: string): ParsedKeyChord | null {
	const raw = chord.trim();
	if (!raw) return null;

	// Single uppercase letter represents Shift + lowercase key
	if (raw.length === 1 && raw >= "A" && raw <= "Z") {
		return {
			ctrl: false,
			meta: false,
			primary: false,
			shift: true,
			key: raw.toLowerCase() as CanonicalKey,
		};
	}

	// Single canonical key
	if (raw.length === 1 && ALL_CANONICAL_KEYS.has(raw)) {
		return {
			ctrl: false,
			meta: false,
			primary: false,
			shift: false,
			key: raw as CanonicalKey,
		};
	}

	const parts = raw
		.toLowerCase()
		.split("+")
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.length === 0) return null;

	let ctrl = false;
	let meta = false;
	let primary = false;
	let shift = false;
	let key: CanonicalKey | undefined;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]!;
		if (i < parts.length - 1) {
			if (part === "ctrl") {
				ctrl = true;
			} else if (part === "meta" || part === "alt") {
				meta = true;
			} else if (part === "primary") {
				primary = true;
			} else if (part === "shift") {
				shift = true;
			} else {
				return null;
			}
		} else {
			// Final token is the base key
			if (ALL_CANONICAL_KEYS.has(part)) {
				key = part as CanonicalKey;
			} else {
				return null;
			}
		}
	}

	if (!key) return null;
	return { ctrl, meta, primary, shift, key };
}

/**
 * Formats a parsed chord back into strict canonical string format.
 */
export function formatParsedChord(parsed: ParsedKeyChord): string {
	const parts: string[] = [];
	if (parsed.ctrl) parts.push("ctrl");
	if (parsed.meta) parts.push("meta");
	if (parsed.primary) parts.push("primary");
	if (parsed.shift) parts.push("shift");
	parts.push(parsed.key);
	return parts.join("+");
}

/**
 * Normalizes any valid chord string into strict canonical format.
 */
export function normalizeChord(chord: string): string | null {
	const parsed = parseChord(chord);
	return parsed ? formatParsedChord(parsed) : null;
}

export function isSpecialChord(chord: string): boolean {
	const parsed = parseChord(chord);
	if (!parsed) return false;
	return (
		parsed.ctrl ||
		parsed.meta ||
		parsed.primary ||
		parsed.shift ||
		parsed.key.length > 1
	);
}

/**
 * Platform-neutral dynamic chord matcher checking incoming terminal events against canonical chords.
 */
export function chordMatches(chord: string, event: KeyInputEvent): boolean {
	const target = parseChord(chord);
	if (!target) return false;

	// Canonicalize incoming event key name or character via map
	const rawName = (event.name ?? "").toLowerCase();
	const rawChar = (event.char ?? "").toLowerCase();

	const isControlChar = Boolean(
		rawChar.length === 1 &&
			rawChar.charCodeAt(0) >= 1 &&
			rawChar.charCodeAt(0) <= 26 &&
			rawChar !== "\t" &&
			rawChar !== "\n" &&
			rawChar !== "\r",
	);
	const platformPrimary =
		event.primary ??
		(event.platform === "mac"
			? Boolean(event.meta)
			: event.platform === "windows" || event.platform === "linux"
				? Boolean(event.ctrl) || isControlChar
				: false);
	const eventHasCtrl = event.platform
		? event.platform === "mac"
			? Boolean(event.ctrl)
			: event.platform === "unknown"
				? Boolean(event.ctrl) || isControlChar
				: false
		: Boolean(event.ctrl) || isControlChar;
	const eventHasMeta = event.platform === "mac" ? false : Boolean(event.meta);
	if (eventHasCtrl !== target.ctrl) return false;
	if (eventHasMeta !== target.meta) return false;
	if (platformPrimary !== target.primary) return false;

	// Check shift modifier
	const isCharUppercase = Boolean(
		event.char &&
			event.char.length === 1 &&
			event.char >= "A" &&
			event.char <= "Z",
	);
	const eventHasShift = Boolean(event.shift) || isCharUppercase;
	if (eventHasShift !== target.shift) return false;

	const eventKey =
		TERMINAL_KEY_MAP[rawName] ??
		TERMINAL_KEY_MAP[rawChar] ??
		(rawChar || rawName);

	return eventKey === target.key;
}

/** Return the effective command bindings after central defaults and overrides. */
export function resolveKeymapBindings(
	profile: EditorKeymapProfile,
): readonly WorkspaceKeybinding[] {
	const overrides = profile.keybindings ?? {};
	const known = new Set(
		DEFAULT_COMMAND_KEYBINDINGS.map((item) => item.command),
	);
	const defaultCombinedChords = new Map<string, Set<string>>();
	for (const item of DEFAULT_COMMAND_KEYBINDINGS) {
		const set = defaultCombinedChords.get(item.command) ?? new Set();
		for (const chord of item.chords) set.add(chord);
		defaultCombinedChords.set(item.command, set);
	}

	const isExplicitUserOverride = (
		command: string,
		chords: readonly string[],
	): boolean => {
		const defaultSet = defaultCombinedChords.get(command);
		if (!defaultSet) return true;
		if (chords.length !== defaultSet.size) return true;
		return chords.some((c) => !defaultSet.has(c));
	};

	const bindings = DEFAULT_COMMAND_KEYBINDINGS.map((binding) => {
		if (
			Object.hasOwn(overrides, binding.command) &&
			isExplicitUserOverride(binding.command, overrides[binding.command] ?? [])
		) {
			return {
				...binding,
				chords: overrides[binding.command] ?? [],
			};
		}
		return binding;
	});
	for (const [command, chords] of Object.entries(overrides)) {
		if (known.has(command)) continue;
		bindings.push({ command, chords });
	}
	return bindings;
}

export function matchKeymapCommand(
	profile: EditorKeymapProfile,
	event: KeyInputEvent,
	context: KeymapContext,
): string | undefined {
	const bindings = resolveKeymapBindings(profile);
	const contextValues = {
		activeTabId: context.activeTabId,
		activeViewId: context.activeViewId,
		focusedPane: context.focusedPane,
		focusedRegion: context.focusedRegion,
		textInputOwner: context.textInputOwner,
	};
	for (const binding of bindings) {
		for (const chord of binding.chords) {
			if (!chordMatches(chord, event)) continue;
			return matchSharedEffectiveBindings(
				bindings as readonly KeymapBindingDto[],
				chord,
				context.editorMode,
				contextValues,
			)?.command;
		}
	}
	return undefined;
}

/**
 * Resolve a chord against a flat, already-resolved binding list (the same shape
 * the browser receives as `KeymapBindingDto` / `WorkspaceKeybinding`). This is
 * the single canonical matcher the browser imports so React never duplicates
 * `contextExpressionMatches` / `chordMatches`.
 *
 * `chord` is a normalized canonical chord string (e.g. `primary+k`, `escape`,
 * `g g`). It may be a single chord or a space-separated multi-chord sequence;
 * only the final chord is matched here. The caller owns multi-chord pending
 * state.
 */
export function matchEffectiveBindings(
	bindings: readonly WorkspaceKeybinding[],
	chord: string,
	mode?: string,
	context: Readonly<Record<string, string | boolean | undefined>> = {},
): WorkspaceKeybinding | undefined {
	return matchSharedEffectiveBindings(
		bindings as readonly KeymapBindingDto[],
		chord,
		mode,
		context,
	) as WorkspaceKeybinding | undefined;
}

/** Canonical Macro context API, backed by the shared renderer-neutral evaluator. */
export function contextMatches(
	context: KeymapContext,
	expression?: ContextExpression,
): boolean {
	return matchSharedContext(expression, {
		activeTabId: context.activeTabId,
		activeViewId: context.activeViewId,
		focusedPane: context.focusedPane,
		focusedRegion: context.focusedRegion,
		textInputOwner: context.textInputOwner,
		editorMode: context.editorMode,
	});
}

export function keymapBindingConflicts(
	profile: EditorKeymapProfile,
): readonly { chord: string; first: string; second: string }[] {
	const conflicts: { chord: string; first: string; second: string }[] = [];
	const seen: Array<{ normalized: string; binding: WorkspaceKeybinding }> = [];
	for (const binding of resolveKeymapBindings(profile)) {
		for (const chord of binding.chords) {
			const normalized = normalizeChord(chord);
			if (!normalized) continue;
			for (const prior of seen) {
				if (
					prior.normalized === normalized &&
					prior.binding.command !== binding.command &&
					modesOverlap(prior.binding.modes, binding.modes) &&
					contextsOverlap(prior.binding.when, binding.when)
				)
					conflicts.push({
						chord,
						first: prior.binding.command,
						second: binding.command,
					});
			}
			seen.push({ normalized, binding });
		}
	}
	return conflicts;
}

function modesOverlap(
	first: WorkspaceKeybinding["modes"],
	second: WorkspaceKeybinding["modes"],
): boolean {
	return !first || !second || first.some((mode) => second.includes(mode));
}

function contextsOverlap(
	first: WorkspaceKeybinding["when"],
	second: WorkspaceKeybinding["when"],
): boolean {
	if (!first || !second) return true;
	if (isModalOnly(first) && excludesModal(second)) return false;
	if (isModalOnly(second) && excludesModal(first)) return false;
	if ("not" in first && "key" in first.not && "key" in second)
		return first.not.key !== second.key || first.not.equals !== second.equals;
	if ("not" in second && "key" in second.not && "key" in first)
		return second.not.key !== first.key || second.not.equals !== first.equals;
	if ("key" in first && "key" in second)
		return first.key !== second.key || first.equals === second.equals;
	return true;
}

function isModalOnly(
	expression: NonNullable<WorkspaceKeybinding["when"]>,
): boolean {
	return (
		"key" in expression &&
		expression.key === "focusedPane" &&
		expression.equals === "modal"
	);
}

function excludesModal(
	expression: NonNullable<WorkspaceKeybinding["when"]>,
): boolean {
	if ("not" in expression && "key" in expression.not)
		return (
			expression.not.key === "focusedPane" && expression.not.equals === "modal"
		);
	if ("allOf" in expression)
		return expression.allOf.some(
			(item) =>
				"not" in item &&
				"key" in item.not &&
				item.not.key === "focusedPane" &&
				item.not.equals === "modal",
		);
	return false;
}

export function matchesChordValue(
	bindingValue: KeyChordValue | undefined,
	keyOrChord: string,
): boolean {
	if (!bindingValue) return false;
	const normalizedInput = normalizeChord(keyOrChord) ?? keyOrChord;
	const candidates = Array.isArray(bindingValue)
		? bindingValue
		: [bindingValue];
	return candidates.some((candidate) => {
		if (!candidate) return false;
		if (candidate === keyOrChord || candidate === normalizedInput) return true;
		const norm = normalizeChord(candidate);
		return norm === keyOrChord || norm === normalizedInput;
	});
}

export function mergeEditorKeymap(
	base: EditorKeymapProfile,
	override?: Partial<EditorKeymapProfile>,
): EditorKeymapProfile {
	if (!override) return base;
	const keybindings = {
		...(base.keybindings ?? {}),
		...(override.keybindings ?? {}),
	} as Record<string, readonly string[]>;
	return {
		profileId: override.profileId ?? base.profileId,
		name: override.name ?? base.name,
		description: override.description ?? base.description,
		normal: { ...base.normal, ...override.normal },
		sequences: { ...base.sequences, ...override.sequences },
		visual: { ...base.visual, ...override.visual },
		window: { ...base.window, ...override.window },
		keybindings,
	};
}

export interface KeymapDiagnostic {
	readonly severity: "error" | "warning";
	readonly code:
		| "duplicate-binding"
		| "sequence-prefix-conflict"
		| "invalid-chord"
		| "reserved-binding";
	readonly message: string;
	readonly bindings: readonly string[];
	readonly paths: readonly string[];
}

export interface KeymapValidationOptions {
	readonly allowIntentionalModeOverlap?: boolean;
	readonly allowSequencePrefixes?: boolean;
}

export function validateEditorKeymap(
	profile: EditorKeymapProfile,
	options: KeymapValidationOptions = {},
): readonly KeymapDiagnostic[] {
	const diagnostics: KeymapDiagnostic[] = [];
	for (const binding of resolveKeymapBindings(profile)) {
		for (const chord of binding.chords) {
			if (!normalizeChord(chord))
				diagnostics.push({
					severity: "error",
					code: "invalid-chord",
					message: `Unknown chord '${chord}' for command '${binding.command}'.`,
					bindings: [chord],
					paths: [`keybindings.${binding.command}`],
				});
		}
	}
	for (const conflict of keymapBindingConflicts(profile))
		diagnostics.push({
			severity: "error",
			code: "duplicate-binding",
			message: `Chord '${conflict.chord}' is bound to both '${conflict.first}' and '${conflict.second}'.`,
			bindings: [conflict.chord],
			paths: [
				`keybindings.${conflict.first}`,
				`keybindings.${conflict.second}`,
			],
		});
	const modes = ["normal", "sequences", "visual", "window"] as const;
	for (const mode of modes) {
		const seen = new Map<string, [string, string]>();
		for (const [action, chordValue] of Object.entries(profile[mode])) {
			if (!chordValue) continue;
			const chords = Array.isArray(chordValue) ? chordValue : [chordValue];
			for (const chord of chords) {
				if (!chord) continue;
				const normalized = normalizeChord(chord);
				if (
					!normalized &&
					(mode !== "sequences" || !/^[[\]a-zA-Z]+$/u.test(chord))
				) {
					diagnostics.push({
						severity: "error",
						code: "invalid-chord",
						message: `Unknown chord '${chord}'. Must conform to canonical grammar [ctrl+][meta+][primary+][shift+]<canonical_key>.`,
						bindings: [chord],
						paths: [`${mode}.${action}`],
					});
					continue;
				}
				const key = normalized ?? chord;
				const prior = seen.get(key);
				if (prior && prior[1] !== action) {
					diagnostics.push({
						severity: "error",
						code: "duplicate-binding",
						message: `Chord '${chord}' is bound to both '${prior[1]}' and '${action}'.`,
						bindings: [prior[0], chord],
						paths: [`${mode}.${prior[1]}`, `${mode}.${action}`],
					});
				} else seen.set(key, [chord, action]);
			}
		}
	}
	const sequences: Array<[string, string]> = [];
	for (const [action, value] of Object.entries(profile.sequences)) {
		if (!value) continue;
		const chords = Array.isArray(value) ? value : [value];
		for (const chord of chords) {
			if (chord) sequences.push([action, chord]);
		}
	}
	for (let i = 0; i < sequences.length; i++) {
		for (let j = i + 1; j < sequences.length; j++) {
			const [a, first] = sequences[i]!;
			const [b, second] = sequences[j]!;
			if (
				first === second ||
				first.startsWith(second) ||
				second.startsWith(first)
			) {
				if (first === second || !options.allowSequencePrefixes)
					diagnostics.push({
						severity: "error",
						code: "sequence-prefix-conflict",
						message: `Sequences '${first}' and '${second}' conflict.`,
						bindings: [first, second],
						paths: [`sequences.${a}`, `sequences.${b}`],
					});
			}
		}
	}
	return diagnostics;
}
