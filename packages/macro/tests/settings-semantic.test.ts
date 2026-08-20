import { describe, expect, test } from "bun:test";
import {
	analyzeFormatTemplate,
	FREQUENCY_TOKENS,
	QUANTITY_TOKENS,
} from "../src/values/token-spec";
import {
	frequencySettingsSemanticProvider,
	quantitySettingsSemanticProvider,
	SettingsSemanticRegistry,
} from "../src/workspace";

describe("settings semantic previews", () => {
	test("analyzes legacy bare tokens without inventing unknown literals", () => {
		const analysis = analyzeFormatTemplate("NUM UNIT", QUANTITY_TOKENS);
		expect(analysis.tokens).toEqual(["NUM", "UNIT"]);
		expect(analysis.unknownTokens).toHaveLength(0);
	});

	test("reports only explicitly delimited unknown tokens", () => {
		const analysis = analyzeFormatTemplate(
			"every <INTERVAL_MAGNITUDE>",
			FREQUENCY_TOKENS,
		);
		expect(analysis.unknownTokens.map((item) => item.text)).toEqual([
			"INTERVAL_MAGNITUDE",
		]);
	});

	test("provides quantity previews from the active grammar", async () => {
		const result = await quantitySettingsSemanticProvider.preview({
			requestId: "quantity-1",
			settingsRevision: "revision-1",
			path: ["values", "quantity", "templates"],
			draftValue: ["NUM UNIT"],
			effectiveSettings: {
				values: { quantity: { templates: ["NUM UNIT"] } },
			},
			sampleInput: "5 mg",
		});
		expect(result.status).toBe("valid");
		expect(result.sample?.matched).toBe(true);
		expect(result.tokenDescriptors?.some((token) => token.id === "UNIT")).toBe(
			true,
		);
	});

	test("provides frequency previews from the active grammar", async () => {
		const result = await frequencySettingsSemanticProvider.preview({
			requestId: "frequency-1",
			settingsRevision: "revision-1",
			path: ["values", "frequency", "templates"],
			draftValue: ["every INTERVAL_MAG INTERVAL_UNIT"],
			effectiveSettings: {
				values: {
					frequency: {
						templates: ["every INTERVAL_MAG INTERVAL_UNIT"],
						intervalPrefixes: ["every"],
						timeUnitAliases: { hour: ["hour", "hours"] },
					},
				},
			},
			sampleInput: "every 2 hours",
		});
		expect(result.providerId).toBe("values.frequency");
		expect(result.templateAnalysis?.[0]?.tokens).toContain("INTERVAL_MAG");
	});

	test("selects providers by exact setting path", () => {
		const registry = new SettingsSemanticRegistry()
			.register(quantitySettingsSemanticProvider)
			.register(frequencySettingsSemanticProvider);
		expect(registry.getForPath(["values", "quantity", "templates"])?.id).toBe(
			"values.quantity",
		);
		expect(registry.getForPath(["appearance", "theme"])).toBeUndefined();
	});
});
