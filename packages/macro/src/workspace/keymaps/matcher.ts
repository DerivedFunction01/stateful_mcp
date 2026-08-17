import { type EditorKeymapProfile, SpecialKeys } from "./types";

export interface KeyInputEvent {
	readonly char?: string;
	readonly name?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
}

const SPECIAL_TOKENS = new Set<string>(Object.values(SpecialKeys));

export function normalizeChord(chord: string): string | null {
	const value = chord.trim();
	if (!value) return null;
	const normalizedName = value
		.toUpperCase()
		.replace(/\+/gu, "_")
		.replace(/^(CTRL|SHIFT)-/u, "$1_");
	if (SPECIAL_TOKENS.has(normalizedName)) return normalizedName;
	if (value.length === 1 && !/[\s\u0000]/u.test(value)) return value;
	return null;
}

export function isSpecialChord(chord: string): boolean {
	const normalized = normalizeChord(chord);
	return normalized !== null && SPECIAL_TOKENS.has(normalized);
}

/**
 * Platform-neutral chord matcher checking an incoming key event against a configured chord.
 */
export function chordMatches(chord: string, event: KeyInputEvent): boolean {
	chord = normalizeChord(chord) ?? chord;
	if (isSpecialChord(chord)) {
		switch (chord) {
			case SpecialKeys.CtrlR:
				return (
					Boolean(event.ctrl) &&
					(event.char?.toLowerCase() === "r" || event.name === "r")
				);
			case SpecialKeys.CtrlS:
				return (
					Boolean(event.ctrl) &&
					!event.shift &&
					(event.char?.toLowerCase() === "s" || event.name === "s")
				);
			case SpecialKeys.CtrlShiftR:
				return (
					Boolean(event.ctrl) &&
					Boolean(event.shift) &&
					(event.char?.toLowerCase() === "r" || event.name === "r")
				);
			case SpecialKeys.CtrlAltR:
				return (
					Boolean(event.ctrl) &&
					Boolean(event.meta) &&
					(event.char?.toLowerCase() === "r" || event.name === "r")
				);
			case SpecialKeys.Enter:
				return event.name === "return" || event.name === "enter";
			case SpecialKeys.Escape:
				return event.name === "escape" || event.char === "\x1b";
			case SpecialKeys.Delete:
				return event.name === "delete";
			case SpecialKeys.Backspace:
				return event.name === "backspace";
			case SpecialKeys.Tab:
				return event.name === "tab" && !event.shift && event.char !== "\x1b[Z";
			case "SHIFT_TAB":
				return (
					(event.name === "tab" && Boolean(event.shift)) ||
					event.char === "\x1b[Z"
				);
			case "CTRL_P":
				return (
					Boolean(event.ctrl) &&
					(event.char?.toLowerCase() === "p" || event.name === "p")
				);
			case "CTRL_B":
				return (
					Boolean(event.ctrl) &&
					(event.char?.toLowerCase() === "b" || event.name === "b")
				);
			case "CTRL_W":
				return (
					Boolean(event.ctrl) &&
					(event.char?.toLowerCase() === "w" || event.name === "w")
				);
			case "ALT_P":
				return (
					Boolean(event.meta) &&
					(event.char?.toLowerCase() === "p" || event.name === "p")
				);
			case "CTRL_ENTER":
				return (
					Boolean(event.ctrl) &&
					(event.name === "return" || event.name === "enter")
				);
			case SpecialKeys.Up:
				return event.name === "up" || event.name === "upArrow";
			case SpecialKeys.Down:
				return event.name === "down" || event.name === "downArrow";
			case SpecialKeys.Left:
				return event.name === "left" || event.name === "leftArrow";
			case SpecialKeys.Right:
				return event.name === "right" || event.name === "rightArrow";
			case SpecialKeys.PageUp:
				return event.name === "pageUp" || event.name === "pageup";
			case SpecialKeys.PageDown:
				return event.name === "pageDown" || event.name === "pagedown";
			case SpecialKeys.Home:
				return event.name === "home";
			case SpecialKeys.End:
				return event.name === "end";
			default:
				return false;
		}
	}

	// Plain single character without modifiers
	return event.char === chord && !event.ctrl && !event.meta;
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
					message: `Unknown chord '${chord}'.`,
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
