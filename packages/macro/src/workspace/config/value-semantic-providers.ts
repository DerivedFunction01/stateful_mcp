import {
	type CurrencyFormatConfig,
	parseCurrency,
} from "../../values/currency";
import {
	type DateTimeFormatConfig,
	parseDateTimeStringToConfig,
} from "../../values/date-time";
import {
	type FrequencyGrammarConfig,
	parseCadenceSchedule,
} from "../../values/frequency";
import {
	type NumericParseOptions,
	parseNumericValue,
} from "../../values/numeric";
import {
	parseQuantity,
	type QuantityGrammarConfig,
} from "../../values/quantity";
import {
	analyzeFormatTemplate,
	CURRENCY_TOKENS,
	DATE_TIME_TOKENS,
	FREQUENCY_TOKENS,
	getValueTokenDescriptors,
	QUANTITY_TOKENS,
} from "../../values/token-spec";
import type {
	SettingsPreviewResult,
	SettingsSemanticProvider,
} from "./settings-semantic";
import type { SettingsDiagnostic } from "./settings-service";

function atPath(
	root: Readonly<Record<string, unknown>>,
	path: readonly string[],
): unknown {
	return path.reduce<unknown>((current, key) => {
		if (!current || typeof current !== "object" || Array.isArray(current))
			return undefined;
		return (current as Record<string, unknown>)[key];
	}, root);
}

function diagnostic(
	path: readonly string[],
	item: { readonly code?: string; readonly message: string },
): SettingsDiagnostic {
	return {
		severity: "error",
		code: item.code,
		path,
		messageKey: "settings.values.parseError",
		messageParams: { code: item.code ?? "unknown", message: item.message },
	};
}

function templatesFrom(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function resultStatus(
	diagnostics: readonly SettingsDiagnostic[],
): "valid" | "invalid" {
	return diagnostics.some((item) => item.severity === "error")
		? "invalid"
		: "valid";
}

function quantityRuntimeTokens(
	config: QuantityGrammarConfig,
): ReadonlySet<string> {
	const available = new Set(["NUM", "NUM_LOW", "NUM_HIGH"]);
	if (Object.keys(config.unitAliases ?? {}).length > 0) available.add("UNIT");
	if (config.operatorConfig) {
		available.add("OP_PREFIX");
		available.add("OP_POSTFIX");
		available.add("OP_SUFFIX");
	}
	if (config.statisticalConfig) available.add("STAT_QUALIFIER");
	if (config.templates?.some((template) => typeof template !== "string"))
		available.add("FILLER");
	if ((config.rangeDelimiters ?? []).length > 0) available.add("UNIT");
	return available;
}

function frequencyRuntimeTokens(
	config: FrequencyGrammarConfig,
): ReadonlySet<string> {
	const available = new Set<string>();
	if ((config.intervalPrefixes ?? []).length > 0)
		available.add("INTERVAL_PREFIX");
	if (
		(config.timeUnitAliases ?? {}) &&
		Object.keys(config.timeUnitAliases ?? {}).length > 0
	) {
		available.add("INTERVAL_UNIT");
		available.add("OFFSET_UNIT");
	}
	if (
		config.eventAnchorAliases &&
		Object.keys(config.eventAnchorAliases).length > 0
	)
		available.add("ANCHOR");
	if ((config.recurrenceConnectors ?? []).length > 0)
		available.add("RECURRENCE_CONN");
	if ((config.conditionalAliases ?? []).length > 0) {
		available.add("PRN_TRIGGER");
		available.add("CONDITION");
	}
	return available;
}

export const quantitySettingsSemanticProvider: SettingsSemanticProvider = {
	id: "values.quantity",
	settingPaths: [
		["values", "quantity", "templates"],
		["values", "quantity", "rangeDelimiters"],
		["values", "quantity", "fillerConnectors"],
	],
	describe: () => ({
		providerId: "values.quantity",
		tokenDomain: "quantity",
		supportsSampleInput: true,
		supportsTokenCatalog: true,
	}),
	preview(request): SettingsPreviewResult {
		const path = ["values", "quantity", "templates"] as const;
		const config = (atPath(request.draftSettings ?? request.effectiveSettings, [
			"values",
			"quantity",
		]) ?? {}) as QuantityGrammarConfig;
		const templates = templatesFrom(
			request.path.at(-1) === "templates"
				? request.draftValue
				: config.templates,
		);
		const analyses = templates.map((template) =>
			analyzeFormatTemplate(template, QUANTITY_TOKENS),
		);
		const diagnostics = analyses.flatMap<SettingsDiagnostic>((analysis) =>
			analysis.unknownTokens.map((item) => ({
				severity: "error" as const,
				code: "UNKNOWN_TEMPLATE_TOKEN",
				path,
				messageKey: "settings.values.unknownTemplateToken",
				messageParams: { token: item.text },
			})),
		);
		let sample: SettingsPreviewResult["sample"];
		if (request.sampleInput) {
			const parsed = parseQuantity(request.sampleInput, {
				...config,
				templates,
			});
			diagnostics.push(
				...parsed.diagnostics.map((item) => diagnostic(path, item)),
			);
			sample = {
				input: request.sampleInput,
				matched: Boolean(parsed.value),
				value: parsed.value,
			};
		}
		return {
			requestId: request.requestId,
			settingsRevision: request.settingsRevision,
			providerId: "values.quantity",
			status: resultStatus(diagnostics),
			diagnostics,
			tokenDescriptors: getValueTokenDescriptors(
				"quantity",
				quantityRuntimeTokens(config),
			),
			templateAnalysis: analyses,
			sample,
		};
	},
};

export const frequencySettingsSemanticProvider: SettingsSemanticProvider = {
	id: "values.frequency",
	settingPaths: [
		["values", "frequency", "templates"],
		["values", "frequency", "intervalPrefixes"],
		["values", "frequency", "recurrenceConnectors"],
		["values", "frequency", "conditionalAliases"],
		["values", "frequency", "conditionConnectors"],
		["values", "frequency", "rangeDelimiters"],
	],
	describe: () => ({
		providerId: "values.frequency",
		tokenDomain: "frequency",
		supportsSampleInput: true,
		supportsTokenCatalog: true,
	}),
	preview(request): SettingsPreviewResult {
		const path = ["values", "frequency", "templates"] as const;
		const config = (atPath(request.draftSettings ?? request.effectiveSettings, [
			"values",
			"frequency",
		]) ?? {}) as FrequencyGrammarConfig;
		const templates = templatesFrom(
			request.path.at(-1) === "templates"
				? request.draftValue
				: config.templates,
		);
		const analyses = templates.map((template) =>
			analyzeFormatTemplate(template, FREQUENCY_TOKENS),
		);
		const diagnostics = analyses.flatMap<SettingsDiagnostic>((analysis) =>
			analysis.unknownTokens.map((item) => ({
				severity: "error" as const,
				code: "UNKNOWN_TEMPLATE_TOKEN",
				path,
				messageKey: "settings.values.unknownTemplateToken",
				messageParams: { token: item.text },
			})),
		);
		let sample: SettingsPreviewResult["sample"];
		if (request.sampleInput) {
			const parsed = parseCadenceSchedule(request.sampleInput, {
				...config,
				templates,
			});
			diagnostics.push(
				...parsed.diagnostics.map((item) => diagnostic(path, item)),
			);
			sample = {
				input: request.sampleInput,
				matched: Boolean(parsed.value),
				value: parsed.value,
			};
		}
		return {
			requestId: request.requestId,
			settingsRevision: request.settingsRevision,
			providerId: "values.frequency",
			status: resultStatus(diagnostics),
			diagnostics,
			tokenDescriptors: getValueTokenDescriptors(
				"frequency",
				frequencyRuntimeTokens(config),
			),
			templateAnalysis: analyses,
			sample,
		};
	},
};

export const numericSettingsSemanticProvider: SettingsSemanticProvider = {
	id: "values.numeric",
	settingPaths: [
		["values", "numeric", "decimalSeparator"],
		["values", "numeric", "thousandsSeparator"],
		["values", "numeric", "allowFractions"],
		["values", "numeric", "allowScientific"],
	],
	describe: () => ({
		providerId: "values.numeric",
		supportsSampleInput: true,
		supportsTokenCatalog: false,
	}),
	preview(request): SettingsPreviewResult {
		const config = (atPath(request.draftSettings ?? request.effectiveSettings, [
			"values",
			"numeric",
		]) ?? {}) as NumericParseOptions;
		const diagnostics: SettingsDiagnostic[] = [];
		const sample = request.sampleInput
			? parseNumericValue(request.sampleInput, config)
			: undefined;
		if (sample)
			diagnostics.push(
				...sample.diagnostics.map((item) => diagnostic(request.path, item)),
			);
		return {
			requestId: request.requestId,
			settingsRevision: request.settingsRevision,
			providerId: "values.numeric",
			status: resultStatus(diagnostics),
			diagnostics,
			sample:
				sample && request.sampleInput
					? {
							input: request.sampleInput,
							matched: Boolean(sample.parsed),
							value: sample.parsed,
						}
					: undefined,
		};
	},
};

export const currencySettingsSemanticProvider: SettingsSemanticProvider = {
	id: "values.currency",
	settingPaths: [
		["values", "currency", "defaultCurrency"],
		["values", "currency", "templates"],
		["values", "currency", "negativeStyle"],
	],
	describe: () => ({
		providerId: "values.currency",
		tokenDomain: "currency",
		supportsSampleInput: true,
		supportsTokenCatalog: true,
	}),
	preview(request): SettingsPreviewResult {
		const config = (atPath(request.draftSettings ?? request.effectiveSettings, [
			"values",
			"currency",
		]) ?? {}) as CurrencyFormatConfig;
		const templates = templatesFrom(
			request.path.at(-1) === "templates"
				? request.draftValue
				: config.templates,
		);
		const analyses = templates.map((template) =>
			analyzeFormatTemplate(template, CURRENCY_TOKENS),
		);
		const diagnostics = analyses.flatMap<SettingsDiagnostic>((analysis) =>
			analysis.unknownTokens.map((item) => ({
				severity: "error" as const,
				code: "UNKNOWN_TEMPLATE_TOKEN",
				path: request.path,
				messageKey: "settings.values.unknownTemplateToken",
				messageParams: { token: item.text },
			})),
		);
		const parsed = request.sampleInput
			? parseCurrency(request.sampleInput, config)
			: undefined;
		if (parsed)
			diagnostics.push(
				...parsed.diagnostics.map((item) => diagnostic(request.path, item)),
			);
		return {
			requestId: request.requestId,
			settingsRevision: request.settingsRevision,
			providerId: "values.currency",
			status: resultStatus(diagnostics),
			diagnostics,
			tokenDescriptors: getValueTokenDescriptors("currency"),
			templateAnalysis: analyses,
			sample:
				parsed && request.sampleInput
					? {
							input: request.sampleInput,
							matched: Boolean(parsed.value),
							value: parsed.value,
						}
					: undefined,
		};
	},
};

export const dateTimeSettingsSemanticProvider: SettingsSemanticProvider = {
	id: "values.dateTime",
	settingPaths: [
		["values", "dateTime", "defaultFormat"],
		["values", "dateTime", "is24Hour"],
		["values", "dateTime", "defaultTimeZone"],
	],
	describe: () => ({
		providerId: "values.dateTime",
		tokenDomain: "date-time",
		supportsSampleInput: false,
		supportsTokenCatalog: true,
	}),
	preview(request): SettingsPreviewResult {
		const value =
			request.path.at(-1) === "defaultFormat"
				? request.draftValue
				: atPath(request.draftSettings ?? request.effectiveSettings, [
						"values",
						"dateTime",
						"defaultFormat",
					]);
		const template = typeof value === "string" ? value : "";
		const analysis = analyzeFormatTemplate(template, DATE_TIME_TOKENS);
		const config = parseDateTimeStringToConfig(
			template,
		) as DateTimeFormatConfig;
		const diagnostics = analysis.unknownTokens.map((item) => ({
			severity: "error" as const,
			code: "UNKNOWN_TEMPLATE_TOKEN",
			path: request.path,
			messageKey: "settings.values.unknownTemplateToken",
			messageParams: { token: item.text },
		}));
		return {
			requestId: request.requestId,
			settingsRevision: request.settingsRevision,
			providerId: "values.dateTime",
			status: resultStatus(diagnostics),
			diagnostics,
			tokenDescriptors: getValueTokenDescriptors("date-time"),
			templateAnalysis: [analysis],
			sample: {
				input: template,
				matched: config.tokens.length > 0,
				value: config,
			},
		};
	},
};

export const DEFAULT_SETTINGS_SEMANTIC_PROVIDERS: readonly SettingsSemanticProvider[] =
	[
		quantitySettingsSemanticProvider,
		frequencySettingsSemanticProvider,
		numericSettingsSemanticProvider,
		currencySettingsSemanticProvider,
		dateTimeSettingsSemanticProvider,
	];
