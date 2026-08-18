import { describe, expect, it } from "bun:test";
import { I18nKernel } from "@stateful-mcp/macro";
import {
	EN_LOCALE_CLI,
	ES_LOCALE_CLI,
	registerCliLocales,
} from "../src/locales";

describe("Modular i18n Architecture & Catalogs", () => {
	it("aggregates all modular slices into EN_LOCALE_CLI without empty or undefined values", () => {
		const enKeys = Object.keys(EN_LOCALE_CLI);
		expect(enKeys.length).toBeGreaterThan(100);

		for (const [key, value] of Object.entries(EN_LOCALE_CLI)) {
			expect(typeof value).toBe("string");
			expect(value.length).toBeGreaterThan(0);
		}
	});

	it("guarantees 100% key parity between English and Spanish CLI catalogs", () => {
		const enKeys = Object.keys(EN_LOCALE_CLI);
		const esKeys = Object.keys(ES_LOCALE_CLI);

		expect(esKeys.sort()).toEqual(enKeys.sort());

		for (const key of enKeys) {
			const esVal = (ES_LOCALE_CLI as Record<string, string>)[key];
			expect(esVal).toBeDefined();
			expect(esVal!.length).toBeGreaterThan(0);
		}
	});

	it("registers catalogs dynamically into I18nKernel and resolves translations with parameters", () => {
		const kernel = new I18nKernel("en");
		registerCliLocales(kernel);

		// English lookup
		expect(
			kernel.t("statusBar.validRatio", {
				valid: 5,
				total: 10,
			}),
		).toBe("5/10 valid");

		// Switch to Spanish
		kernel.setActiveLocale("es");
		expect(
			kernel.t("statusBar.validRatio", {
				valid: 5,
				total: 10,
			}),
		).toBe("5/10 válidos");

		// Settings schema key in Spanish
		expect(
			kernel.t("settings.schema.values.numeric.decimalSeparator.title"),
		).toBe("Separador Decimal");
	});

	it("falls back to key when translation is not found in any catalog", () => {
		const kernel = new I18nKernel("en");
		expect(kernel.t("non.existent.key")).toBe("non.existent.key");
	});
});
