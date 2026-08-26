import type {
	CompiledDomainGrammar,
	UserMacroProfile,
} from "../contracts/extension-config";
import type { ValueKind } from "../contracts/values";
import { compileDomainConfig } from "../extensions/config";
import type { ScannerSyntax } from "../parser/macro-scanner";
import type { CurrencyFormatConfig } from "./currency";
import { buildCurrencyPatternString } from "./currency";
import type { DateTimeFormatConfig, DateTimeFormatRegistry } from "./date-time";
import { buildDatePatternString, createDateTimeRegistry } from "./date-time";
import { normalizeUnicodeDigits } from "./localization";
import {
	createMeasurementValue,
	createMeasurementValueFromQuantity,
} from "./measurement";
import type { QuantityConsumerPolicy, QuantityGrammarConfig } from "./quantity";
import { escapeRegex } from "./regex";
import { createBuiltinTerminals } from "./terminals";

export type PatternCompilerValueKind =
	| ValueKind
	| "date"
	| "concept"
	| "string"
	| "number";

export interface PatternCompilerOptions {
	readonly grammar?: CompiledDomainGrammar | Partial<UserMacroProfile>;
	readonly syntax?: ScannerSyntax;
}

/**
 * Dedicated Pattern & Grammar Compiler that dynamically generates Unicode-safe regex patterns
 * and value parsers from user/domain configurations without hardcoded locale or language assumptions.
 */
export class ValuePatternCompiler {
	private readonly quantityConfig: QuantityGrammarConfig;
	private readonly currencyConfig?: CurrencyFormatConfig;
	private readonly dateConfig?: DateTimeFormatConfig;
	private readonly dateTimeRegistry?: DateTimeFormatRegistry;
	private readonly syntax?: ScannerSyntax;
	private readonly compiledGrammar: CompiledDomainGrammar;

	constructor(options: PatternCompilerOptions = {}) {
		const { grammar, syntax } = options;
		this.syntax = syntax;
		if (grammar && "quantity" in grammar && grammar.quantity) {
			this.compiledGrammar = grammar as CompiledDomainGrammar;
			this.quantityConfig = grammar.quantity;
			this.currencyConfig = grammar.currency;
			this.dateConfig = grammar.date;
			this.dateTimeRegistry = grammar.dateTime;
		} else {
			const profile = grammar as Partial<UserMacroProfile> | undefined;
			this.compiledGrammar = compileDomainConfig(profile);
			const valQuantity = profile?.values?.quantity;
			this.quantityConfig = {
				unitAliases: profile?.unitAliases ?? valQuantity?.unitAliases ?? {},
				...(profile?.operatorAliases || valQuantity?.operatorConfig
					? {
							operatorConfig: valQuantity?.operatorConfig ?? {
								operators: profile?.operatorAliases ?? {},
							},
						}
					: {}),
				...(profile?.statisticalAliases || valQuantity?.statisticalConfig
					? {
							statisticalConfig: valQuantity?.statisticalConfig ?? {
								qualifiers: profile?.statisticalAliases ?? {},
							},
						}
					: {}),
				...(profile?.values?.numeric?.decimalSeparator
					? { decimalSeparator: profile.values.numeric.decimalSeparator }
					: {}),
				...(valQuantity ?? {}),
			};
			this.currencyConfig = profile?.values?.currency as
				| CurrencyFormatConfig
				| undefined;
			this.dateConfig = profile?.values?.date as
				| DateTimeFormatConfig
				| undefined;
			this.dateTimeRegistry = profile?.values?.dateTime as
				| DateTimeFormatRegistry
				| undefined;
		}
	}

	/**
	 * Builds a Unicode identifier / concept token pattern.
	 */
	compileConceptPattern(): string {
		const prefixes: string[] = [];
		if (this.syntax?.expressionToken) {
			prefixes.push(escapeRegex(this.syntax.expressionToken));
		}
		if (this.syntax?.conceptToken) {
			prefixes.push(escapeRegex(this.syntax.conceptToken));
		}
		const prefix = prefixes.length > 0 ? `(?:${prefixes.join("|")})?` : "";
		return `${prefix}[\\p{L}\\p{N}_\\-.:]+`;
	}

	/**
	 * Builds a dynamic quantity pattern from the active grammar (including configured units, operators, and ranges).
	 */
	compileQuantityPattern(): string {
		const dec = this.quantityConfig.decimalSeparator === "," ? "," : "\\.";
		const num = `[+-]?\\d+(?:${dec}\\d+)?`;

		// Operator prefixes
		const opAliases: string[] = [];
		const opMap =
			this.quantityConfig.operatorConfig?.operators ??
			this.quantityConfig.operatorConfig?.prefixAliases ??
			{};
		for (const aliases of Object.values(opMap)) {
			opAliases.push(...aliases);
		}
		const opPattern = opAliases.length
			? `(?:${[...opAliases, ">=", "<=", ">", "<", "="]
					.sort((a, b) => b.length - a.length)
					.map(escapeRegex)
					.join("|")}\\s*)?`
			: `(?:[><]=?|=)?\\s*`;

		// Unit suffixes
		const unitPattern = `(?:[\\p{L}\\p{Sc}_°'%/]+|\\[[a-zA-Z0-9_]+\\])?`;

		// Ranges are parsed only through authored fundamentals and enabled recipes.
		return `${opPattern}${num}\\s*${unitPattern}`;
	}

	/**
	 * Builds a dynamic currency pattern from the active currency configuration.
	 */
	compileCurrencyPattern(): string {
		if (
			this.currencyConfig &&
			Object.keys(this.currencyConfig.currencies ?? {}).length > 0
		) {
			const compiled = buildCurrencyPatternString(this.currencyConfig);
			if (compiled.pattern) return compiled.pattern;
		}
		// Generic Unicode currency pattern: any Unicode Currency Symbol \p{Sc} or ISO code with amount
		const dec = this.quantityConfig.decimalSeparator === "," ? "," : "\\.";
		const num = `(?:\\d{1,3}(?:[ ,.]\\d{3})+|\\d+)(?:${dec}\\d+)?`;
		return `(?:\\p{Sc}\\s*${num}|${num}\\s*\\p{Sc}|${num}\\s*[\\p{L}]{3})`;
	}

	/**
	 * Builds a dynamic date pattern from the active date configuration if configured.
	 */
	compileDatePattern(): string {
		const registry =
			this.dateTimeRegistry ?? createDateTimeRegistry(this.dateConfig);
		const registryPatterns = Object.values(registry.formats)
			.filter(
				(definition) =>
					definition.parserEnabled !== false &&
					(definition.kind === "date" || definition.kind === "datetime"),
			)
			.map(
				(definition) =>
					buildDatePatternString(
						definition.tokens,
						definition.separators,
						definition.options,
					).pattern,
			)
			.filter(Boolean);
		if (registryPatterns.length > 0)
			return registryPatterns.length === 1
				? registryPatterns[0]!
				: `(?:${registryPatterns.join("|")})`;
		if (
			this.dateConfig &&
			this.dateConfig.tokens &&
			this.dateConfig.tokens.length > 0
		) {
			const separators =
				this.dateConfig.separators.length === this.dateConfig.tokens.length - 1
					? this.dateConfig.separators
					: Array(this.dateConfig.tokens.length - 1).fill("-");
			const compiled = buildDatePatternString(
				this.dateConfig.tokens,
				separators,
				this.dateConfig.options,
			);
			if (compiled.pattern) return compiled.pattern;
		}
		return "[\\p{L}\\p{N}_\\-.:/]+";
	}

	/**
	 * Builds a generic Unicode word pattern.
	 */
	compileWordPattern(): string {
		return "[\\p{L}\\p{N}_\\-.:]+";
	}

	/**
	 * Builds a pattern based on any PatternCompilerValueKind.
	 */
	compilePatternForKind(kind: PatternCompilerValueKind): string {
		switch (kind) {
			case "concept":
				return this.compileConceptPattern();
			case "quantity":
				return this.compileQuantityPattern();
			case "currency":
				return this.compileCurrencyPattern();
			case "date":
			case "date-time":
				return this.compileDatePattern();
			default:
				return this.compileWordPattern();
		}
	}

	/**
	 * Parses a raw clause value into a structured fundamental value according to the active grammar.
	 */
	parseConfiguredClauseValue(
		kind: PatternCompilerValueKind,
		rawText: string,
		consumerPolicy?: QuantityConsumerPolicy,
	): unknown {
		const trimmed = rawText.trim();
		const normalized = normalizeUnicodeDigits(trimmed);

		if (kind === "concept") {
			let term = trimmed;
			if (
				this.syntax?.expressionToken &&
				term.startsWith(this.syntax.expressionToken)
			) {
				term = term.slice(this.syntax.expressionToken.length);
			} else if (
				this.syntax?.conceptToken &&
				term.startsWith(this.syntax.conceptToken)
			) {
				term = term.slice(this.syntax.conceptToken.length);
			}
			return {
				conceptId: term,
				term,
				rawText: trimmed,
			};
		}

		if (kind === "quantity") {
			const policy: QuantityConsumerPolicy = consumerPolicy ?? {
				allowRange: true,
				allowOperator: true,
				allowDataPointCount: false,
			};
			const terminal = createBuiltinTerminals({ grammar: this.compiledGrammar })
				.quantity!;
			const res = terminal("quantity", normalized, {
				consumerId: "quantity",
				input: normalized,
				grammar: this.compiledGrammar,
				policy: {
					path: "assertion",
					policy,
					quantityConsumerPolicy: policy,
				},
			});
			if (res.valid && res.canonicalValue) {
				return createMeasurementValueFromQuantity(
					res.canonicalValue as Parameters<
						typeof createMeasurementValueFromQuantity
					>[0],
					{
						rawText: trimmed,
					},
				);
			}
			return createMeasurementValue(0, "", { rawText: trimmed });
		}

		if (kind === "currency") {
			const terminal = createBuiltinTerminals({ grammar: this.compiledGrammar })
				.currency!;
			const res = terminal("currency", normalized, {
				consumerId: "currency",
				input: normalized,
				grammar: this.compiledGrammar,
			});
			if (res.valid && res.canonicalValue) {
				const value = res.canonicalValue as {
					amount: number;
					currency: string;
					subunits?: number;
					symbol?: string;
				};
				return {
					kind: "currency",
					amount: value.amount,
					currency: value.currency,
					subunits: value.subunits,
					symbol: value.symbol,
					rawText: trimmed,
				};
			}
			return {
				kind: "currency",
				amount: 0,
				currency: this.currencyConfig?.defaultCurrency ?? "",
				rawText: trimmed,
			};
		}

		if (kind === "date" || kind === "date-time") {
			return { kind: "date-time", rawText: trimmed, value: normalized };
		}

		if (kind === "number") {
			const num = Number(normalized);
			return Number.isNaN(num) ? normalized : num;
		}

		return trimmed;
	}
}
