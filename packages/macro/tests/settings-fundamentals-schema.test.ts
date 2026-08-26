import { describe, expect, test } from "bun:test";
import { STANDARD_UNIT_BUNDLES } from "../src/values/conversion/standard-units";
import { STANDARD_CURRENCY_CATALOG } from "../src/values/currency";
import { CADENCE_TYPES } from "../src/values/frequency";
import {
	createCurrencySchema,
	createDateTimeSchema,
	createFrequencySchema,
	createFundamentalsSchema,
	createNumericSchema,
	createQuantitySchema,
} from "../src/workspace/config/schema/fundamentals";
import { I18nKernel } from "../src/workspace/i18n/i18n-kernel";
import { EN_LOCALE } from "../src/workspace/i18n/locales/en";
import { ES_LOCALE } from "../src/workspace/i18n/locales/es";

describe("Fundamentals Settings Schema (Modular Architecture)", () => {
	const enKernel = new I18nKernel("en");
	enKernel.registerTranslations("en", EN_LOCALE);

	const esKernel = new I18nKernel("es");
	esKernel.registerTranslations("es", ES_LOCALE);

	test("aggregates all fundamentals schemas with category 'values' and canonical group IDs", () => {
		const schema = createFundamentalsSchema(enKernel);
		expect(schema.length).toBeGreaterThan(5);
		for (const entry of schema) {
			expect(entry.category).toBe("values");
			expect(entry.path[0]).toBe("values");
			expect(entry.group).toBeTruthy();
			expect(entry.title).toBeTruthy();
			expect(entry.description).toBeTruthy();
		}
	});

	test("currency schema binds to STANDARD_CURRENCY_CATALOG and localizes cleanly", () => {
		const enSchema = createCurrencySchema(enKernel);
		const currencyCodeEntry = enSchema.find(
			(e) => e.path.join(".") === "values.currency.defaultCurrency",
		);
		expect(currencyCodeEntry).toBeDefined();
		expect(currencyCodeEntry?.group).toBe("currency");
		expect(currencyCodeEntry?.title).toBe("Default Currency Code");
		expect(currencyCodeEntry?.enumValues).toEqual(
			STANDARD_CURRENCY_CATALOG.map((c) => c.code),
		);

		const esSchema = createCurrencySchema(esKernel);
		const esCurrencyEntry = esSchema.find(
			(e) => e.path.join(".") === "values.currency.defaultCurrency",
		);
		expect(esCurrencyEntry?.title).toBe("Código de moneda predeterminado");
	});

	test("dateTime schema provides auto-detected system timezone and localized descriptions", () => {
		const enSchema = createDateTimeSchema(enKernel);
		const tzEntry = enSchema.find(
			(e) => e.path.join(".") === "values.dateTime.defaultTimeZone",
		);
		expect(tzEntry).toBeDefined();
		expect(tzEntry?.group).toBe("dateTime");
		expect(tzEntry?.enumValues).toContain("system");
		expect(tzEntry?.enumValues).toContain("UTC");
		expect(tzEntry?.enumOptions?.[0]?.label).toContain("System Default");

		const esSchema = createDateTimeSchema(esKernel);
		const esTzEntry = esSchema.find(
			(e) => e.path.join(".") === "values.dateTime.defaultTimeZone",
		);
		expect(esTzEntry?.title).toBe("Zona horaria predeterminada");
	});

	test("quantity schema configures STANDARD_UNIT_BUNDLES and range components", () => {
		const schema = createQuantitySchema(enKernel);
		const systemEntry = schema.find(
			(e) => e.path.join(".") === "values.quantity.defaultSystem",
		);
		expect(systemEntry).toBeDefined();
		expect(systemEntry?.group).toBe("quantity");
		expect(systemEntry?.enumValues).toEqual([...STANDARD_UNIT_BUNDLES]);

		const paths = schema.map((e) => e.path.join("."));
		expect(paths).toContain("values.quantity.rangeComponents");
		expect(
			schema.find((e) => e.path.join(".") === "values.quantity.rangeComponents")
				?.type,
		).toBe("json");
	});

	test("frequency schema binds to CADENCE_TYPES", () => {
		const schema = createFrequencySchema(enKernel);
		const cadenceEntry = schema.find(
			(e) => e.path.join(".") === "values.frequency.defaultInterval",
		);
		expect(cadenceEntry).toBeDefined();
		expect(cadenceEntry?.group).toBe("frequency");
		expect(cadenceEntry?.enumValues).toEqual([...CADENCE_TYPES]);
	});

	test("numeric schema configures decimal and grouping separators in English and Spanish", () => {
		const enSchema = createNumericSchema(enKernel);
		const decimalEn = enSchema.find(
			(e) => e.path.join(".") === "values.numeric.decimalSeparator",
		);
		expect(decimalEn?.group).toBe("numeric");
		expect(decimalEn?.title).toBe("Decimal Separator");

		const esSchema = createNumericSchema(esKernel);
		const decimalEs = esSchema.find(
			(e) => e.path.join(".") === "values.numeric.decimalSeparator",
		);
		expect(decimalEs?.title).toBe("Separador decimal");
	});
});
