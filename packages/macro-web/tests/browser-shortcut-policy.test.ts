import { describe, expect, test } from "bun:test";
import {
	classifyChord,
	isRecommendedUserBinding,
	normalizePrimary,
} from "../src/lib/browser-shortcut-policy";
import { BROWSER_WORKBENCH_BASELINE } from "../src/lib/browser-workbench-defaults";

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

	test("baseline entries are canonical commands only", () => {
		expect(
			BROWSER_WORKBENCH_BASELINE.every((binding) =>
				binding.command.startsWith("workspace."),
			),
		).toBe(true);
		expect(
			BROWSER_WORKBENCH_BASELINE.some(
				(binding) => binding.chord === "primary+p" || binding.chord === "f1",
			),
		).toBe(false);
	});
});
