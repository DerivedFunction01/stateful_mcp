import type { EditorKeymapProfile } from "../types";
import { DEFAULT_EDITOR_KEYMAP_PROFILE } from "./default-profile";

export * from "./aliases";
export * from "./commands";
export * from "./default-profile";

/**
 * Registry of shipped and built-in keymap profiles.
 * Users and extensions can add custom profiles here.
 */
export const BUILTIN_KEYMAP_PROFILES: Readonly<
	Record<string, EditorKeymapProfile>
> = {
	default: DEFAULT_EDITOR_KEYMAP_PROFILE,
};
