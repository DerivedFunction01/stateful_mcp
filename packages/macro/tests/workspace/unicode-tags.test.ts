import { describe, expect, it } from "bun:test";
import {
	deduplicateTags,
	hasTag,
	matchesTag,
	normalizeTag,
} from "../../src/workspace/tags/unicode-tag-resolver";

describe("Unicode Tag Resolver", () => {
	it("normalizes tags using Unicode NFC normalization", () => {
		// Combining diacritics: e + combining acute (NFD) -> é (NFC)
		const decomposed = "cirugi\u0301a";
		const composed = "cirugía";
		expect(normalizeTag(decomposed)).toBe(composed);
		expect(normalizeTag("  #review  ")).toBe("#review");
	});

	it("supports multi-script Unicode tags (CJK, Cyrillic, Arabic, Greek)", () => {
		expect(normalizeTag(" 臨床 ")).toBe("臨床");
		expect(normalizeTag(" отчет ")).toBe("отчет");
		expect(normalizeTag(" طبية ")).toBe("طبية");
		expect(normalizeTag(" ιατρική ")).toBe("ιατρική");
	});

	it("matches tags with case-folding and accent tolerance via Intl.Collator", () => {
		// Accented Spanish
		expect(matchesTag("cirugia", "cirugía")).toBe(true);
		expect(matchesTag("CIRUGIA", "cirugía")).toBe(true);
		expect(matchesTag("cirugía", "Cirugía")).toBe(true);

		// Cyrillic case-folding
		expect(matchesTag("отчет", "ОТЧЕТ")).toBe(true);
		expect(matchesTag("ОТЧЕТ", "отчет")).toBe(true);

		// CJK exact substring matching
		expect(matchesTag("臨床", "東京臨床")).toBe(true);
		expect(matchesTag("臨床", "研究")).toBe(false);

		// Empty query matches anything
		expect(matchesTag("", "anything")).toBe(true);
	});

	it("deduplicates tags after canonical normalization", () => {
		const tags = [
			"cirugi\u0301a",
			"cirugía",
			"review",
			"review",
			"臨床",
			"  臨床  ",
		];
		const deduped = deduplicateTags(tags);
		expect(deduped).toEqual(["cirugía", "review", "臨床"]);
	});

	it("checks tag presence using hasTag", () => {
		const tags = ["cirugía", "daily_review"];
		expect(hasTag(tags, "cirugi\u0301a")).toBe(true);
		expect(hasTag(tags, "cirugía")).toBe(true);
		expect(hasTag(tags, "cardio")).toBe(false);
	});
});
