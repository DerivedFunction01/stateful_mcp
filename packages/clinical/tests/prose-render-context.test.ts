import { describe, expect, it } from "bun:test";
import {
	createEnumDisplayResolver,
	ProseRenderLookupCache,
} from "../src/rendering/prose-render-context";
import { renderClinicalDateRange } from "../src/values/utils/date-format-renderer";

describe("prose render context", () => {
	it("localizes neutral enum values through the selected map and locale", () => {
		const display = createEnumDisplayResolver({
			status: {
				en: { active: "Active" },
				zh: { active: "活动" },
				ru: { active: "Активный" },
			},
		});
		expect(display("active", { mapKey: "status", locale: "zh-CN" })).toBe(
			"活动",
		);
		expect(display("active", { mapKey: "status", locale: "ru" })).toBe(
			"Активный",
		);
		expect(display("unknown", { mapKey: "status", locale: "zh" })).toBe(
			"[unmapped:unknown]",
		);
	});

	it("caches in-flight concept lookups", async () => {
		let calls = 0;
		const cache = new ProseRenderLookupCache({
			dictionary: {
				getConcept: async () => {
					calls += 1;
					return {
						id: "c1",
						namespaceCode: "SNOMED",
						standardCode: "1",
						display: "One",
						active: true,
					};
				},
				search: async () => [],
			},
		});
		const [left, right] = await Promise.all([
			cache.getConcept("c1"),
			cache.getConcept("c1"),
		]);
		expect(left?.display).toBe("One");
		expect(right?.display).toBe("One");
		expect(calls).toBe(1);
	});

	it("renders date tokens and opt-in relative labels", () => {
		const range = {
			time: {
				startDatetime: {
					assertedTimestampUtc: "2026-08-06T12:00:00.000Z",
					precisionLevel: "day" as const,
				},
			},
		};
		const format = {
			tokens: ["YYYY", "MM", "DD"] as const,
			separators: ["-", "-"],
		};
		expect(
			renderClinicalDateRange(range, format, {
				mode: "absolute",
				relativeLabels: "never",
				timeZone: "UTC",
			}),
		).toBe("2026-08-06");
		expect(
			renderClinicalDateRange(range, format, {
				mode: "relative",
				relativeLabels: "when_exact",
				now: new Date("2026-08-06T01:00:00.000Z"),
				timeZone: "UTC",
				relativeDayDisplayLabels: { "0": "today" },
			}),
		).toBe("today");
	});
});
