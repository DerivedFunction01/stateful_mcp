import { describe, expect, it } from "bun:test";
import { getCommandBarSuggestions } from "../src/commands/command-autocomplete-provider";
import { createCommandSyntaxProfile } from "../src/commands/command-syntax-profile";
import { bootstrapCommandDefaults } from "../src/bootstrap/bootstrap-config";

const defaultProfile = createCommandSyntaxProfile(
	{ profileId: "v2-default" },
	bootstrapCommandDefaults,
);

describe(" command-bar autocomplete", () => {
	it("suggests direct commands without mutation", async () => {
		const suggestions = await getCommandBarSuggestions(
			{
				input: ":con",
				cursorOffset: 4,
				sessionId: "s1",
			},
			{},
			defaultProfile,
		);
		expect(suggestions.map((item) => item.label)).toContain(":confirm");
	});

	it("suggests branch references from typed context", async () => {
		const suggestions = await getCommandBarSuggestions(
			{
				input: ":confirm ",
				cursorOffset: 9,
				sessionId: "s1",
				branches: [{ id: "b1", commandAlias: "primary", name: "Pneumonia" }],
			},
			{},
			defaultProfile,
		);
		expect(suggestions.map((item) => item.label)).toEqual([
			"primary",
			"Pneumonia",
			"b1",
		]);
	});

	it("does not suggest legacy parser outputs", async () => {
		const suggestions = await getCommandBarSuggestions(
			{
				input: "ordinary text",
				cursorOffset: 13,
				sessionId: "s1",
			},
			{},
			defaultProfile,
		);
		expect(suggestions).toEqual([]);
	});
});
