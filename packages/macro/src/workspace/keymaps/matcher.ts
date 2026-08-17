import {
	ALL_CANONICAL_KEYS,
	type CanonicalKey,
	type EditorKeymapProfile,
} from "./types";

export interface KeyInputEvent {
	readonly char?: string;
	readonly name?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
}

export interface ParsedKeyChord {
	readonly ctrl: boolean;
	readonly meta: boolean;
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
};

/**
 * Strict parser for canonical key chords.
 * Follows the grammar: [ctrl+][meta+][shift+]<canonical_key> or single character (including uppercase for Shift).
 */
export function parseChord(chord: string): ParsedKeyChord | null {
	const raw = chord.trim();
	if (!raw) return null;

	// Single uppercase letter represents Shift + lowercase key
	if (raw.length === 1 && raw >= "A" && raw <= "Z") {
		return {
			ctrl: false,
			meta: false,
			shift: true,
			key: raw.toLowerCase() as CanonicalKey,
		};
	}

	// Single canonical key
	if (raw.length === 1 && ALL_CANONICAL_KEYS.has(raw)) {
		return {
			ctrl: false,
			meta: false,
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
	let shift = false;
	let key: CanonicalKey | undefined;

	for (let i = 0; i < parts.length; i++) {
		const part = parts[i]!;
		if (i < parts.length - 1) {
			if (part === "ctrl") {
				ctrl = true;
			} else if (part === "meta" || part === "alt") {
				meta = true;
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
	return { ctrl, meta, shift, key };
}

/**
 * Formats a parsed chord back into strict canonical string format.
 */
export function formatParsedChord(parsed: ParsedKeyChord): string {
	const parts: string[] = [];
	if (parsed.ctrl) parts.push("ctrl");
	if (parsed.meta) parts.push("meta");
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
	return parsed.ctrl || parsed.meta || parsed.shift || parsed.key.length > 1;
}

/**
 * Platform-neutral dynamic chord matcher checking incoming terminal events against canonical chords.
 */
export function chordMatches(chord: string, event: KeyInputEvent): boolean {
	const target = parseChord(chord);
	if (!target) return false;

	// Check ctrl and meta modifiers
	if (Boolean(event.ctrl) !== target.ctrl) return false;
	if (Boolean(event.meta) !== target.meta) return false;

	// Check shift modifier
	const isCharUppercase = Boolean(
		event.char &&
			event.char.length === 1 &&
			event.char >= "A" &&
			event.char <= "Z",
	);
	const eventHasShift = Boolean(event.shift) || isCharUppercase;
	if (eventHasShift !== target.shift) return false;

	// Canonicalize incoming event key name or character via map
	const rawName = (event.name ?? "").toLowerCase();
	const rawChar = (event.char ?? "").toLowerCase();

	const eventKey =
		TERMINAL_KEY_MAP[rawName] ??
		TERMINAL_KEY_MAP[rawChar] ??
		(rawChar || rawName);

	return eventKey === target.key;
}

export function mergeEditorKeymap(
	base: EditorKeymapProfile,
	override?: Partial<EditorKeymapProfile>,
): EditorKeymapProfile {
	if (!override) return base;
	return {
		profileId: override.profileId ?? base.profileId,
		name: override.name ?? base.name,
		description: override.description ?? base.description,
		normal: { ...base.normal, ...override.normal },
		sequences: { ...base.sequences, ...override.sequences },
		visual: { ...base.visual, ...override.visual },
		window: { ...base.window, ...override.window },
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
	const modes = ["normal", "sequences", "visual", "window"] as const;
	for (const mode of modes) {
		const seen = new Map<string, [string, string]>();
		for (const [action, chord] of Object.entries(profile[mode])) {
			if (!chord) continue;
			const normalized = normalizeChord(chord);
			if (
				!normalized &&
				(mode !== "sequences" || !/^[[\]a-zA-Z]+$/u.test(chord))
			) {
				diagnostics.push({
					severity: "error",
					code: "invalid-chord",
					message: `Unknown chord '${chord}'. Must conform to canonical grammar [ctrl+][meta+][shift+]<canonical_key>.`,
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
	const sequences = Object.entries(profile.sequences).filter(([, value]) =>
		Boolean(value),
	);
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
