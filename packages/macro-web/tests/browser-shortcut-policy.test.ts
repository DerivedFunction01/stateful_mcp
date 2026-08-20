import { describe, expect, test } from "bun:test";
import {
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
});
