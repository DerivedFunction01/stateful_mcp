import { describe, expect, it } from "bun:test";
import { bootstrapCommandDefaults } from "../src/bootstrap/bootstrap-config";
import { getCommandBarSuggestions } from "../src/commands/command-autocomplete-provider";
import { createCommandSyntaxProfile } from "../src/commands/command-syntax-profile";

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

	describe("gated suggestions and collision zone", () => {
		it("suggests only expressions for concept active slot", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
					{
						argumentId: "page_num",
						name: "page_num",
						roleName: "note.page_num",
						extraction: { kind: "scalar", numericBounds: { min: 1, max: 100 } },
					},
				],
			};
			const suggestions = await getCommandBarSuggestions(
				{
					input: "^note title=h",
					cursorOffset: 14,
					sessionId: "s1",
					activeArgumentId: "title",
				},
				{
					macroStore: {
						get: async () => def,
						list: async () => [def],
					} as any,
				dictionary: {
					expressionStore: true,
					async searchExpressionCandidates(this: { expressionStore: boolean }) {
						return this.expressionStore
							? [
									{
										id: "expr-hp",
										term: "Harry Potter",
										lookupTerm: "hp",
										conceptId: "c-hp",
										active: true,
									},
								]
							: [];
					},
				} as any,
				},
				defaultProfile,
			);
			expect(suggestions.every((s) => s.provenance === "expression")).toBe(
				true,
			);
			expect(suggestions.map((s) => s.label)).toContain("Harry Potter");
		});

		it("suggests only numeric values for integer active slot", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
					{
						argumentId: "page_num",
						name: "page_num",
						roleName: "note.page_num",
						extraction: { kind: "scalar", numericBounds: { min: 1, max: 10 } },
					},
				],
			};
			const suggestions = await getCommandBarSuggestions(
				{
					input: "^note page_num=1",
					cursorOffset: 16,
					sessionId: "s1",
					activeArgumentId: "page_num",
				},
				{
					macroStore: {
						get: async () => def,
						list: async () => [def],
					} as any,
				},
				defaultProfile,
			);
			expect(suggestions.every((s) => s.provenance === "numeric")).toBe(true);
			expect(suggestions.map((s) => s.label)).toContain("1");
		});

		it("returns expression suggestions for #h token in discovery mode (no activeArgumentId)", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
					{
						argumentId: "page_num",
						name: "page_num",
						roleName: "note.page_num",
						extraction: { kind: "scalar", numericBounds: { min: 1, max: 100 } },
					},
				],
			};
			const suggestions = await getCommandBarSuggestions(
				{
					input: "^note #h",
					cursorOffset: 8,
					sessionId: "s1",
					// No activeArgumentId — discovery mode
				},
				{
					macroStore: {
						get: async () => def,
						list: async () => [def],
					} as any,
					dictionary: {
						searchExpressionCandidates: async () => [
							{
								id: "expr-hp",
								term: "Harry Potter",
								lookupTerm: "hp",
								conceptId: "c-hp",
								active: true,
							},
							{
								id: "expr-hg",
								term: "Hunger Games",
								lookupTerm: "hg",
								conceptId: "c-hg",
								active: true,
							},
						],
					} as any,
				},
				defaultProfile,
			);
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions.every((s) => s.provenance === "expression")).toBe(true);
			const labels = suggestions.map((s) => s.label);
			expect(labels).toContain("Harry Potter");
			expect(labels).toContain("Hunger Games");
		});

		it("returns expression suggestions for #h token in gated mode (activeArgumentId = title)", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
				],
			};
			const suggestions = await getCommandBarSuggestions(
				{
					input: "^note #h",
					cursorOffset: 8,
					sessionId: "s1",
					activeArgumentId: "title",
				},
				{
					macroStore: {
						get: async () => def,
						list: async () => [def],
					} as any,
					dictionary: {
						searchExpressionCandidates: async () => [
							{
								id: "expr-hp",
								term: "Harry Potter",
								lookupTerm: "hp",
								conceptId: "c-hp",
								active: true,
							},
						],
					} as any,
				},
				defaultProfile,
			);
			expect(suggestions.length).toBeGreaterThan(0);
			expect(suggestions.every((s) => s.provenance === "expression")).toBe(true);
			expect(suggestions.map((s) => s.label)).toContain("Harry Potter");
		});

		it("suggests mixed candidates in collision zone when active slot is none", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
					{
						argumentId: "headline",
						name: "headline",
						roleName: "note.headline",
						extraction: { kind: "concept", patterns: [] },
					},
				],
				authoringTemplates: [
					{
						parts: [
							{ kind: "literal", text: "has page # " },
							{ kind: "slot", argumentId: "page_num", occurrence: 0 },
						],
					},
				],
			};
			const suggestions = await getCommandBarSuggestions(
				{
					input: "^note h",
					cursorOffset: 7,
					sessionId: "s1",
				},
				{
					macroStore: {
						get: async () => def,
						list: async () => [def],
					} as any,
					dictionary: {
						searchExpressionCandidates: async () => [
							{
								id: "expr-hp",
								term: "Harry Potter",
								lookupTerm: "hp",
								conceptId: "c-hp",
								active: true,
							},
						],
					} as any,
				},
				defaultProfile,
			);
			const provenances = suggestions.map((s) => s.provenance);
			expect(provenances).toContain("expression");
			expect(provenances).toContain("template");
			expect(provenances).toContain("argument-name");
		});

		it("removes templates and argument names for already filled slots", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
					{
						argumentId: "page_num",
						name: "page_num",
						roleName: "note.page_num",
						extraction: { kind: "scalar" },
					},
					{
						argumentId: "year",
						name: "year",
						roleName: "note.year",
						extraction: { kind: "scalar" },
					},
				],
				authoringTemplates: [
					{
						parts: [
							{ kind: "literal", text: "My favorite book is " },
							{ kind: "slot", argumentId: "title", occurrence: 0 },
						],
					},
					{
						parts: [
							{ kind: "literal", text: "has page # " },
							{ kind: "slot", argumentId: "page_num", occurrence: 0 },
						],
					},
				],
			};
			const suggestions = await getCommandBarSuggestions(
				{
					input: "^note ",
					cursorOffset: 6,
					sessionId: "s1",
					filledSlots: ["page_num", "year"],
				},
				{
					macroStore: {
						get: async () => def,
						list: async () => [def],
					} as any,
				},
				defaultProfile,
			);
			const labels = suggestions.map((suggestion) => suggestion.label);
			expect(labels).toContain("My favorite book is ");
			expect(labels).not.toContain("has page #");
			expect(labels).toContain("title=");
			expect(labels).not.toContain("page_num=");
			expect(labels).not.toContain("year=");
		});

		it("keeps a matching multi-word prefix before falling back to its last word", async () => {
			const def = {
				macroId: "note",
				macroName: "note",
				version: 1,
				active: true,
				arguments: [
					{
						argumentId: "title",
						name: "title",
						roleName: "note.title",
						extraction: { kind: "concept", patterns: [] },
					},
					{
						argumentId: "page_num",
						name: "page_num",
						roleName: "note.page_num",
						extraction: { kind: "scalar" },
					},
				],
				authoringTemplates: [
					{
						parts: [
							{ kind: "literal", text: "My favorite book is " },
							{ kind: "slot", argumentId: "title", occurrence: 0 },
						],
					},
					{
						parts: [
							{ kind: "literal", text: "has page # " },
							{ kind: "slot", argumentId: "page_num", occurrence: 0 },
						],
					},
				],
			};
			const options = {
				macroStore: {
					get: async () => def,
					list: async () => [def],
				} as any,
			};
			const phraseMatches = await getCommandBarSuggestions(
				{
					input: "^note My ",
					cursorOffset: 9,
					sessionId: "s1",
				},
				options,
				defaultProfile,
			);
			expect(phraseMatches.map((suggestion) => suggestion.label)).toEqual([
				"My favorite book is ",
			]);

			const fallbackMatches = await getCommandBarSuggestions(
				{
					input: "^note My has",
					cursorOffset: 13,
					sessionId: "s1",
				},
				options,
				defaultProfile,
			);
			expect(fallbackMatches.map((suggestion) => suggestion.label)).toContain(
				"has page # ",
			);
		});
	});
});
