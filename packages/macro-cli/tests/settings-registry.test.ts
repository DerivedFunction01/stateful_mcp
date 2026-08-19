import { describe, expect, it } from "bun:test";
import {
	I18nKernel,
	registerMacroLocales,
	type SettingsSchemaEntry,
} from "@stateful-mcp/macro";
import {
	createDefaultSettingsRegistry,
	DEFAULT_WORKSPACE_SETTINGS_VALUES,
	getDefaultSettingsSchema,
} from "../src/config";

describe("Modular Settings Registry & Domain Modules", () => {
	it("registers all 8 domain modules cleanly", () => {
		const registry = createDefaultSettingsRegistry();
		const modules = registry.getAllModules();

		expect(modules.length).toBe(8);

		const moduleIds = modules.map((m) => m.id);
		expect(moduleIds).toContain("syntax");
		expect(moduleIds).toContain("values.numeric");
		expect(moduleIds).toContain("values.dateTime");
		expect(moduleIds).toContain("values.frequency");
		expect(moduleIds).toContain("values.quantity");
		expect(moduleIds).toContain("values.currency");
		expect(moduleIds).toContain("appearance");
		expect(moduleIds).toContain("editor");
	});

	it("constructs deep default settings tree matching canonical values.* structure", () => {
		const defaults = DEFAULT_WORKSPACE_SETTINGS_VALUES as Record<string, any>;

		expect(defaults.syntax).toBeDefined();
		expect(defaults.syntax.macroStartToken).toBe("@");

		expect(defaults.values).toBeDefined();
		expect(defaults.values.numeric.decimalSeparator).toBe(".");
		expect(defaults.values.dateTime.is24Hour).toBe(true);
		expect(defaults.values.frequency.intervalPrefixes).toContain("every");
		expect(defaults.values.quantity.rangeDelimiters).toContain("-");
		expect(defaults.values.currency.defaultCurrency).toBe("USD");

		expect(defaults.appearance.theme).toBe("default");
		expect(defaults.editor.tabSize).toBe(2);
	});

	it("generates localized schema entries in English and Spanish", () => {
		const kernel = new I18nKernel("en");
		registerMacroLocales(kernel);

		const enSchema: readonly SettingsSchemaEntry[] =
			getDefaultSettingsSchema(kernel);
		expect(enSchema.length).toBeGreaterThan(15);

		const decimalEntryEn = enSchema.find(
			(e) => e.path.join(".") === "values.numeric.decimalSeparator",
		);
		expect(decimalEntryEn).toBeDefined();
		expect(decimalEntryEn!.title).toBe("Decimal Separator");

		// Switch kernel to Spanish
		kernel.setActiveLocale("es");
		const esSchema: readonly SettingsSchemaEntry[] =
			getDefaultSettingsSchema(kernel);
		const decimalEntryEs = esSchema.find(
			(e) => e.path.join(".") === "values.numeric.decimalSeparator",
		);
		expect(decimalEntryEs).toBeDefined();
		expect(decimalEntryEs!.title).toBe("Separador Decimal");
	});

	it("validates frequency templates against FREQUENCY_TOKENS", () => {
		const registry = createDefaultSettingsRegistry();

		// Valid draft
		const validDraft = {
			values: {
				frequency: {
					templates: ["every INTERVAL_MAG INTERVAL_UNIT"],
				},
			},
		};
		const validDiag = registry.validate(validDraft);
		expect(validDiag.length).toBe(0);

		// Invalid template with unknown tokens
		const invalidDraft = {
			values: {
				frequency: {
					templates: ["invalid foo bar baz"],
				},
			},
		};
		const invalidDiag = registry.validate(invalidDraft);
		expect(invalidDiag.length).toBe(1);
		expect(invalidDiag[0]!.message).toContain(
			"Template 'invalid foo bar baz' contains no recognized frequency tokens",
		);
	});
});
