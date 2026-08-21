import { describe, expect, test } from "bun:test";
import {
	auditKeymapPolicy,
	classifyChord,
	isRecommendedUserBinding,
	normalizePrimary,
} from "../src/lib/browser-shortcut-policy";
import {
	baselineCapability,
	getEffectiveCommandShortcut,
} from "../src/lib/browser-workbench-defaults";

describe("browser shortcut policy", () => {
	test("normalizes platform-neutral primary chords", () => {
		expect(normalizePrimary("ctrl+shift+p")).toBe("primary+shift+p");
		expect(normalizePrimary("meta+p")).toBe("meta+p");
	});

	test("classifies browser chrome shortcuts as unavailable", () => {
		const policy = classifyChord("primary+t");
		expect(policy.disposition).toBe("browser-chrome");
		expect(policy.canPreventDefaultWhenDelivered).toBe(false);
		expect(isRecommendedUserBinding("primary+t")).toBe(false);
	});

	test("keeps page commands conditional when browser defaults may win", () => {
		const policy = classifyChord("primary+f");
		expect(policy.disposition).toBe("conditional");
		expect(policy.canPreventDefaultWhenDelivered).toBe(true);
	});

	test("treats primary+p as print but allows Chromium-style command palette interception", () => {
		const print = classifyChord("primary+p");
		expect(print.disposition).toBe("conditional");
		expect(print.browserNotes.join(" ")).toContain("print");
		expect(print.canPreventDefaultWhenDelivered).toBe(true);

		const commandPalette = classifyChord("primary+shift+p");
		expect(commandPalette.disposition).toBe("conditional");
		expect(commandPalette.canPreventDefaultWhenDelivered).toBe(true);
		expect(commandPalette.browserNotes.join(" ")).toContain("Firefox");
	});

	test("does not treat unknown chords as safely remappable", () => {
		const policy = classifyChord("primary+alt+z");
		expect(policy.disposition).toBe("unknown");
		expect(policy.recommendedForUserBinding).toBe(false);
	});

	test("resolves effective shortcuts dynamically from snapshot keymap", () => {
		const mockSnapshot = {
			keymap: {
				profileId: "default",
				name: "Standard Vim Modal",
				workbench: {
					openCommandPalette: "ctrl+shift+p",
					quickOpen: "ctrl+p",
					openSettings: "ctrl+,",
					toggleSidepanel: "ctrl+b",
				},
				bindings: [],
			},
		} as any;

		expect(
			getEffectiveCommandShortcut(mockSnapshot, "workbench.commandPalette"),
		).toBe("ctrl+shift+p");
		expect(
			getEffectiveCommandShortcut(mockSnapshot, "workbench.openSettings"),
		).toBe("ctrl+,");
		expect(
			getEffectiveCommandShortcut(mockSnapshot, "workspace.toggleSidepanel"),
		).toBe("ctrl+b");
	});

	test("baselineCapability classifies valid chords", () => {
		const cap = baselineCapability("ctrl+shift+p");
		expect(cap.disposition).toBeDefined();
	});

	test("primary+shift+f has non-unknown policy", () => {
		const policy = classifyChord("primary+shift+f");
		expect(policy.disposition).not.toBe("unknown");
	});

	test("keeps explicit meta distinct from primary", () => {
		expect(classifyChord("meta+p").disposition).toBe("platform-reserved");
		expect(classifyChord("primary+p").disposition).toBe("conditional");
	});
});

describe("auditKeymapPolicy", () => {
	test("reports unknown chords from bindings", () => {
		const result = auditKeymapPolicy([
			{ command: "editor.splitGroup", chords: ["ctrl+\\"] },
			{ command: "custom.action", chords: ["ctrl+shift+x"] },
		]);
		expect(result.unknownChords).toContain("primary+shift+x");
		expect(result.unknownChords).not.toContain("primary+\\");
	});

	test("reports duplicate chords across bindings with overlapping modes", () => {
		const result = auditKeymapPolicy([
			{ command: "cmd.a", chords: ["ctrl+s"], modes: ["NORMAL"] },
			{ command: "cmd.b", chords: ["ctrl+s"], modes: ["NORMAL", "INSERT"] },
		]);
		expect(result.duplicatePolicyChords).toContain("primary+s");
		expect(result.conflictingBindings.length).toBeGreaterThan(0);
		expect((result.conflictingBindings as any)[0].commands).toEqual([
			"cmd.a",
			"cmd.b",
		]);
	});

	test("does not report mode-disjoint bindings as duplicates", () => {
		const result = auditKeymapPolicy([
			{
				command: "editor.executeLine",
				chords: ["enter"],
				modes: ["NORMAL", "VISUAL"],
			},
			{ command: "editor.splitLine", chords: ["enter"], modes: ["INSERT"] },
		]);
		expect(result.duplicatePolicyChords).not.toContain("enter");
		expect(result.conflictingBindings).toHaveLength(0);
	});

	test("returns empty arrays for empty bindings", () => {
		const result = auditKeymapPolicy([]);
		expect(result.unknownChords).toEqual([]);
		expect(result.duplicatePolicyChords).toEqual([]);
		expect(result.conflictingBindings).toEqual([]);
	});

	test("reports unrestricted binding as conflicting with mode-restricted binding", () => {
		const result = auditKeymapPolicy([
			{ command: "cmd.a", chords: ["ctrl+s"] },
			{ command: "cmd.b", chords: ["ctrl+s"], modes: ["NORMAL"] },
		]);
		expect(result.duplicatePolicyChords).toContain("primary+s");
	});
});
