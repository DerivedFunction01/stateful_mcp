import { type EditorKeymapProfile, SpecialKeys } from "./types";

export interface KeyInputEvent {
	readonly char?: string;
	readonly name?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
}

const SPECIAL_TOKENS = new Set<string>(Object.values(SpecialKeys));

export function isSpecialChord(chord: string): boolean {
	return SPECIAL_TOKENS.has(chord);
}

/**
 * Platform-neutral chord matcher checking an incoming key event against a configured chord.
 */
export function chordMatches(chord: string, event: KeyInputEvent): boolean {
	if (isSpecialChord(chord)) {
		switch (chord) {
			case SpecialKeys.CtrlR:
				return (
					Boolean(event.ctrl) &&
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
