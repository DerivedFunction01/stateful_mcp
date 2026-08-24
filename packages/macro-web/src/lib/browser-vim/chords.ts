import {
	getBrowserShortcutPlatform,
	normalizeBrowserChord,
	type ShortcutPlatform,
} from "../bindings";
import type { BrowserVimKeyboardEvent } from "./types";

export function normalizeChordFromEvent(
	event: BrowserVimKeyboardEvent,
	platform: ShortcutPlatform = getBrowserShortcutPlatform(),
): string {
	return normalizeBrowserChord(
		{
			key: event.key,
			code: event.key,
			ctrlKey: Boolean(event.ctrlKey),
			metaKey: Boolean(event.metaKey),
			altKey: Boolean(event.altKey),
			shiftKey: Boolean(event.shiftKey),
		},
		platform,
	);
}

export type { ShortcutPlatform };
