import type {
	CompiledDomainGrammar,
	UserMacroProfile,
} from "../contracts/extension-config";
import type { ValueKind } from "../contracts/values";
import type { ScannerSyntax } from "../parser/macro-scanner";
import type { CurrencyFormatConfig } from "./currency";
import { buildCurrencyPatternString, parseCurrency } from "./currency";
import type { DateTimeFormatConfig } from "./date-time";
import { buildDatePatternString } from "./date-time";
import { normalizeUnicodeDigits } from "./localization";
import {
	createMeasurementValue,
	createMeasurementValueFromQuantity,
} from "./measurement";
import type { QuantityConsumerPolicy, QuantityGrammarConfig } from "./quantity";
import { parseQuantity } from "./quantity";
import { escapeRegex } from "./regex";

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
	private readonly syntax?: ScannerSyntax;

	constructor(options: PatternCompilerOptions = {}) {
		const { grammar, syntax } = options;
		this.syntax = syntax;
		if (grammar && "quantity" in grammar && grammar.quantity) {
			this.quantityConfig = grammar.quantity;
			this.currencyConfig = grammar.currency;
			this.dateConfig = grammar.date;
		} else {
			const profile = grammar as Partial<UserMacroProfile> | undefined;
			this.quantityConfig = {
				unitAliases: profile?.unitAliases ?? {},
				rangeDelimiters: profile?.rangeDelimiters ?? [],
				operatorAliases: profile?.operatorAliases ?? {},
				statisticalAliases: profile?.statisticalAliases ?? {},
				...(profile?.decimalSeparator
					? { decimalSeparator: profile.decimalSeparator }
					: {}),
			};
			this.currencyConfig = profile?.currency;
			this.dateConfig = profile?.date;
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
		for (const aliases of Object.values(
			this.quantityConfig.operatorAliases ?? {},
		)) {
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

		// Range connectors (only if configured)
		const rangeDels = (this.quantityConfig.rangeDelimiters ?? []).map(
			escapeRegex,
		);
		const rangePattern =
			rangeDels.length > 0
				? `(?:\\s*(?:${rangeDels.join("|")})\\s*${num}\\s*${unitPattern})?`
				: "";

		return `${opPattern}${num}\\s*${unitPattern}${rangePattern}`;
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
	parseClauseValue(
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
				statistics: "ignore",
				allowDataPointCount: false,
			};
			const res = parseQuantity(normalized, this.quantityConfig, policy);
			if (res.value) {
				return createMeasurementValueFromQuantity(res.value, {
					rawText: trimmed,
				});
			}
			return createMeasurementValue(0, "", { rawText: trimmed });
		}

		if (kind === "currency") {
			const res = parseCurrency(normalized, this.currencyConfig);
			if (res.value) {
				return {
					kind: "currency",
					amount: res.value.amount,
					currency: res.value.currency,
					subunits: res.value.subunits,
					symbol: res.value.symbol,
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
