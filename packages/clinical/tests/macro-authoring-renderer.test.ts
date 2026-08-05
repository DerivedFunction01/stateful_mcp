import { describe, expect, test } from "bun:test";
import { renderMacroAuthoringTemplate } from "../src/macros/macro-authoring-renderer";
import type { CommandMacroAuthoringTemplate } from "../src/macros/macro-definition";

describe("macro authoring renderer", () => {
	test("renders resolved and blank named slots without changing draft values", () => {
		const template: CommandMacroAuthoringTemplate = {
			version: 1,
			parts: [],
			templateText:
				"My favorite book is {title} when I read it in the year {year} and I got to page {page}.",
			slots: {
				title: { argumentId: "title", occurrence: 0 },
				year: { argumentId: "year", occurrence: 0 },
				page: { argumentId: "page_num", occurrence: 0 },
			},
		};

		const result = renderMacroAuthoringTemplate(template, [
			{ argumentId: "title", value: "Harry Potter", status: "bound" },
		]);

		expect(result.text).toBe(
			"My favorite book is Harry Potter when I read it in the year <blank: year> and I got to page <blank: page>.",
		);
		expect(result.missing).toEqual(["year", "page_num"]);
		expect(result.invalid).toEqual([]);
	});

	test("renders legacy ordered parts and invalid slots", () => {
		const template: CommandMacroAuthoringTemplate = {
			version: 1,
			parts: [
				{ kind: "literal", text: "title=" },
				{
					kind: "slot",
					argumentId: "title",
					occurrence: 0,
					displayText: "title",
				},
			],
		};

		const result = renderMacroAuthoringTemplate(template, [
			{ argumentId: "title", value: "2004", status: "invalid" },
		]);

		expect(result.text).toBe("title=<invalid: title>");
		expect(result.missing).toEqual([]);
		expect(result.invalid).toEqual(["title"]);
	});
});
