import { describe, expect, test } from "bun:test";
import {
	createMacroWorkspace,
	DEFAULT_EDITOR_KEYMAP_PROFILE,
	type EditorKeymapProfile,
	I18nKernel,
} from "@stateful-mcp/macro";
import { registerCliLocales } from "../src/locales";
import {
	buildContextualHelpBarHints,
	buildDynamicKeymapHints,
} from "../src/ui/primitives/TuiHelpBar";

describe("Dynamic Keymap-Driven HelpBar Hints", () => {
	const i18n = new I18nKernel();
	registerCliLocales(i18n);

	test("derives hints for settings tab dynamically from default keymap", () => {
		const workspace = createMacroWorkspace({ initialLocale: "en" });
		registerCliLocales(workspace.i18n);
		workspace.settingsModal?.open();

		const hints = buildContextualHelpBarHints(
			workspace,
			DEFAULT_EDITOR_KEYMAP_PROFILE,
		);

		expect(hints).toBeDefined();
		expect(hints.length).toBeGreaterThanOrEqual(4);

		// Verified dynamic pairing from DEFAULT_COMMAND_KEYBINDINGS:
		// navigateDown ("j") + navigateUp ("k") -> "j/k"
		const navHint = hints.find((h) => h.key === "j/k");
		expect(navHint).toBeDefined();
		expect(navHint?.action).toBe("Navigate");

		// focusNavigation ("h") + focusContent ("l") -> "h/l"
		const focusHint = hints.find((h) => h.key === "h/l");
		expect(focusHint).toBeDefined();

		const saveHint = hints.find((h) => h.key === "Ctrl+S");
		expect(saveHint).toBeDefined();
		expect(saveHint?.action).toBe("Save Settings");
	});

	test("derives hints dynamically when user customizes keymap profile", () => {
		const customKeymap: EditorKeymapProfile = {
			...DEFAULT_EDITOR_KEYMAP_PROFILE,
			profileId: "custom-emacs",
			name: "Custom Emacs-like",
			keybindings: {
				...DEFAULT_EDITOR_KEYMAP_PROFILE.keybindings,
				"settings.navigateDown": ["ctrl+n"],
				"settings.navigateUp": ["ctrl+p"],
				"settings.focusSearch": ["ctrl+f"],
				"settings.save": ["ctrl+x+ctrl+s"],
			},
		};

		const workspace = createMacroWorkspace({ initialLocale: "en" });
		registerCliLocales(workspace.i18n);
		workspace.settingsModal?.open();

		const hints = buildContextualHelpBarHints(workspace, customKeymap);

		// Chords must reflect custom chords without fallback to j/k
		const navHint = hints.find((h) => h.key === "Ctrl+N/Ctrl+P");
		expect(navHint).toBeDefined();

		const searchHint = hints.find((h) => h.key === "Ctrl+F");
		expect(searchHint).toBeDefined();

		const saveHint = hints.find((h) => h.key === "Ctrl+X+Ctrl+S");
		expect(saveHint).toBeDefined();
	});

	test("localizes action labels when Spanish locale is active", () => {
		const workspace = createMacroWorkspace({ initialLocale: "es" });
		registerCliLocales(workspace.i18n);
		workspace.settingsModal?.open();

		const hints = buildContextualHelpBarHints(
			workspace,
			DEFAULT_EDITOR_KEYMAP_PROFILE,
		);

		const saveHint = hints.find((h) => h.key === "Ctrl+S");
		expect(saveHint).toBeDefined();
		expect(saveHint?.action).toBe("Guardar Configuración");

		const backHint = hints.find((h) => h.key === "Esc");
		expect(backHint).toBeDefined();
		expect(backHint?.action).toBe("Volver al Editor");
	});

	test("derives scratchpad insert mode hints dynamically from keymap", () => {
		const hints = buildDynamicKeymapHints(
			DEFAULT_EDITOR_KEYMAP_PROFILE,
			i18n,
			"INSERT",
		);

		expect(hints.some((h) => h.key === "Tab")).toBe(true);
		expect(hints.some((h) => h.key === "Enter")).toBe(true);
		expect(hints.some((h) => h.action === "Normal Mode")).toBe(true);
	});
});
