export const EN_KEYMAP: Record<string, string> = {
	"keymap.source.macro-profile": "Macro profile",
	"keymap.source.browser-baseline": "Browser default",
	"keymap.source.user-override": "User override",
	"keymap.source.extension": "Extension",
	"keymap.conflict": "Chord is also bound to another command",
	"keymap.conditional": "Shortcut may be claimed by the browser",
	"keymap.unavailable": "Shortcut is not reliably remappable in the browser",
	"keymap.chord.cancelled": "Key chord cancelled",
	"keymap.chord.timeout": "Key chord timed out",
	"keymap.chordPrefix": "Key chord prefix pressed; waiting for chord",
	"keymap.shortcutUnavailable": "Shortcut is not remappable in the browser:",
	"keymap.shortcutConditional": "Browser may handle this shortcut:",
	"keymap.noBinding": "No binding is active for this context",
	"keymap.profileUnknown": "The selected keymap profile is unavailable",
	"keymap.diagnostic.invalidChord":
		"Unknown chord '{chord}' for command '{command}'.",
	"keymap.diagnostic.invalidChordFormat":
		"Unknown chord '{chord}'. Must conform to canonical grammar [ctrl+][meta+][primary+][shift+]<canonical_key>.",
	"keymap.diagnostic.duplicateBinding":
		"Chord '{chord}' is bound to both '{first}' and '{second}'.",
	"keymap.diagnostic.sequencePrefixConflict":
		"Sequences '{first}' and '{second}' conflict.",
	"keymap.diagnostic.surface.requiredFields":
		"Surface keybindings require a key, action, and label.",
	"keymap.diagnostic.surface.duplicate":
		"Duplicate surface keybinding '{key}' in {mode} mode.",
};
