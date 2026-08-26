import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { CompiledDomainGrammar } from "../contracts/extension-config";
import {
	type AliasResolver,
	type ResolverContext,
	resolveAlias,
} from "./aliases";
import type { CurrencyFormatConfig } from "./currency";
import { evaluateCurrencyGrammar } from "./currency";
import { checkNumericBounds, parseNumericValue } from "./numeric";
import { resolveOperator } from "./operators";
import type { QuantityGrammarResult } from "./quantity";
import { evaluateQuantityGrammar, resolveUnitAlias } from "./quantity";
import type {
	AsyncTerminalParser,
	RecipeDiagnostic,
	TerminalParseResult,
	TerminalParser,
} from "./recipes";
import { resolveStatisticalQualifier } from "./statistics";

export interface BuiltinTerminalOptions {
	readonly grammar: CompiledDomainGrammar;
	readonly aliasResolvers?: Readonly<Record<string, AliasResolver>>;
}

export const BUILTIN_VALUE_TERMINAL_IDS = Object.freeze([
	"number",
	"numeric",
	"quantity",
	"quantity-amount",
	"quantity-unit",
	"quantity-packaging",
	"quantity-filler",
	"currency",
	"concept",
	"text",
	"unit",
	"operator",
	"statistic",
	"frequency-count",
	"frequency-unit",
	"frequency-alias",
	"frequency-anchor",
	"frequency-direction",
	"rate-denominator",
	"currency-marker",
	"currency-amount",
	"date-year",
	"date-month",
	"date-day",
	"date-month-name",
	"alias:canonical-id",
	"alias:literal",
	"alias:resolver",
	"alias:fundamental",
	"alias:extraction",
	"alias:number-word",
]);

function diagnostics(
	items: readonly {
		code?: string;
		messageKey?: string;
		messageParams?: Readonly<Record<string, MessageParam>>;
	}[],
): readonly RecipeDiagnostic[] {
	return items.map((item) => ({
		errorCode: item.code,
		messageKey: item.messageKey ?? "values.terminal.invalid",
		messageParams: item.messageParams,
	}));
}

function result(
	value: unknown | undefined,
	items: readonly {
		code?: string;
		messageKey?: string;
		messageParams?: Readonly<Record<string, MessageParam>>;
	}[],
): TerminalParseResult {
	return {
		valid: value !== undefined && items.length === 0,
		value,
		canonicalValue: value,
		diagnostics: diagnostics(items),
		stable: true,
	};
}

export function createBuiltinTerminals(
	options: BuiltinTerminalOptions,
): Readonly<Record<string, TerminalParser>> {
	const { grammar } = options;
	const terminals: Record<string, TerminalParser> = {
		number: (_id, input, request) => {
			const parsed = parseNumericValue(
				input,
				(request?.grammar ?? grammar).quantity.numericConfig,
			);
			return result(parsed.parsed, parsed.diagnostics);
		},
		quantity: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const parsed = evaluateQuantityGrammar(
				input,
				activeGrammar.quantity,
				request?.policy?.quantityConsumerPolicy ?? {},
			);
			if (
				parsed.value &&
				request?.policy?.bounds &&
				!checkNumericBounds(
					parsed.value.primaryQuantity.magnitude,
					request.policy.bounds,
				)
			) {
				return {
					valid: false,
					diagnostics: [
						{
							errorCode: "NUMERIC_BOUNDS",
							messageKey: "values.numeric.outOfBounds",
							messageParams: request.policy.path
								? { argumentId: request.policy.path }
								: undefined,
						},
					],
				};
			}
			return result(parsed.value, parsed.diagnostics);
		},
		"quantity-amount": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const parsed = parseNumericValue(input, config);
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"quantity-unit": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const resolved = resolveUnitAlias(
				input,
				config.unitAliases,
				config.locales,
			);
			return resolved
				? {
						valid: true,
						value: resolved.canonicalUnit,
						canonicalValue: resolved.canonicalUnit,
						displayValue: resolved.matchedAlias,
						metadata: { matchedAlias: resolved.matchedAlias },
					}
				: { valid: false, stable: true };
		},
		"quantity-packaging": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			if (Array.isArray(config.packagingClassifiers)) {
				return config.packagingClassifiers.some(
					(alias) =>
						alias.toLocaleLowerCase(config.locales as string) === normalized,
				)
					? result(input.trim(), [])
					: { valid: false, stable: true };
			}
			const entries = Object.entries(config.packagingClassifiers ?? {}) as [
				string,
				readonly string[],
			][];
			for (const [canonical, aliases] of entries) {
				if (
					canonical.toLocaleLowerCase(config.locales as string) ===
						normalized ||
					(typeof aliases !== "string" &&
						aliases.some(
							(alias) =>
								alias.toLocaleLowerCase(config.locales as string) ===
								normalized,
						))
				)
					return result(canonical, []);
			}
			return { valid: false, stable: true };
		},
		"quantity-filler": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).quantity;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			return config.fillerConnectors?.some(
				(alias) =>
					alias.toLocaleLowerCase(config.locales as string) === normalized,
			)
				? result(input.trim(), [])
				: { valid: false, stable: true };
		},
		currency: (_id, input, request) => {
			const parsed = evaluateCurrencyGrammar(
				input,
				(request?.grammar ?? grammar).currency ?? {},
			);
			return result(parsed.value, parsed.diagnostics);
		},
		concept: (_id, input) => ({
			valid: input.trim().length > 0,
			canonicalValue: {
				conceptId: input.trim(),
				term: input.trim(),
				rawText: input.trim(),
			},
			displayValue: input.trim(),
			stable: true,
		}),
		text: (_id, input) => ({
			valid: input.trim().length > 0,
			canonicalValue: input.trim(),
			displayValue: input.trim(),
			stable: true,
		}),
		unit: (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const resolved = resolveUnitAlias(
				input,
				activeGrammar.quantity.unitAliases,
				activeGrammar.quantity.locales,
			);
			return resolved
				? {
						valid: true,
						canonicalValue: resolved.canonicalUnit,
						displayValue: resolved.matchedAlias,
						metadata: { matchedAlias: resolved.matchedAlias },
						stable: true,
					}
				: { valid: false, stable: true };
		},
		operator: (_id, input, request) => {
			const operator = resolveOperator(
				input,
				(request?.grammar ?? grammar).quantity.operatorConfig ?? {},
			);
			return operator
				? {
						valid: true,
						canonicalValue: operator,
						displayValue: input.trim(),
						stable: true,
					}
				: { valid: false, stable: true };
		},
		statistic: (_id, input, request) => {
			const statistic = resolveStatisticalQualifier(
				input,
				(request?.grammar ?? grammar).quantity.statisticalConfig ?? {},
				request?.policy?.quantityConsumerPolicy?.statisticsPolicy,
			);
			return statistic.qualifier
				? {
						valid: true,
						canonicalValue: statistic.qualifier,
						displayValue: input.trim(),
						stable: true,
					}
				: {
						valid: false,
						diagnostics: diagnostics(statistic.diagnostics),
						stable: true,
					};
		},
		"frequency-count": (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const config = activeGrammar.frequency;
			const numeric = parseNumericValue(input, config?.numericConfig);
			if (numeric.parsed)
				return result(numeric.parsed.value, numeric.diagnostics);
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [count, aliases] of Object.entries(
				config?.multiplierAliases ?? {},
			)) {
				if (
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					)
				)
					return result(Number(count), []);
			}
			return result(undefined, numeric.diagnostics);
		},
		"frequency-unit": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [unit, aliases] of Object.entries(
				config?.timeUnitAliases ?? {},
			)) {
				if (
					unit.toLocaleLowerCase(config?.locales as string) === normalized ||
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					)
				)
					return result(unit, []);
			}
			return { valid: false, stable: true };
		},
		"frequency-alias": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [alias, schedule] of Object.entries(
				config?.frequencyAliases ?? {},
			)) {
				if (alias.toLocaleLowerCase(config?.locales as string) === normalized)
					return result({ ...schedule, rawText: input.trim() }, []);
			}
			return { valid: false, stable: true };
		},
		"frequency-anchor": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [anchor, aliases] of Object.entries(
				config?.eventAnchorAliases ?? {},
			)) {
				if (
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					) ||
					anchor.toLocaleLowerCase(config?.locales as string) === normalized
				)
					return result(anchor, []);
			}
			return { valid: false, stable: true };
		},
		"frequency-direction": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).frequency;
			const normalized = input
				.trim()
				.toLocaleLowerCase(config?.locales as string);
			for (const [direction, aliases] of Object.entries(
				config?.relativeOffsetConnectors ?? {},
			)) {
				if (
					aliases.some(
						(alias) =>
							alias.toLocaleLowerCase(config?.locales as string) === normalized,
					)
				)
					return result(direction, []);
			}
			return { valid: false, stable: true };
		},
		"rate-denominator": (_id, input, request) => {
			const activeGrammar = request?.grammar ?? grammar;
			const parsed = evaluateQuantityGrammar(
				input,
				activeGrammar.quantity,
				request?.policy?.quantityConsumerPolicy ?? {},
			);
			if (parsed.value) {
				return {
					valid: true,
					value: parsed.value,
					canonicalValue: parsed.value,
					stable: true,
				};
			}
			const unit = resolveUnitAlias(input, activeGrammar.quantity.unitAliases);
			if (unit) {
				const fallback: QuantityGrammarResult = {
					primaryQuantity: {
						magnitude: 1,
						unit: unit.canonicalUnit,
						rawText: input.trim(),
					},
					rawText: input.trim(),
				};
				return {
					valid: true,
					value: fallback,
					canonicalValue: fallback,
					stable: true,
				};
			}
			return {
				valid: false,
				diagnostics: parsed.diagnostics.map((d) => ({
					errorCode: d.code,
					messageKey: d.messageKey ?? "values.terminal.invalid",
					messageParams: d.messageParams,
				})),
				stable: true,
			};
		},
		"currency-marker": (_id, input, request) => {
			const config: CurrencyFormatConfig =
				(request?.grammar ?? grammar).currency ?? {};
			const normalized = input
				.trim()
				.toLocaleLowerCase(config.locales as string);
			for (const definition of config.definitions ?? []) {
				if (
					definition.code.toLocaleLowerCase(config.locales as string) ===
					normalized
				) {
					return {
						valid: true,
						value: {
							code: definition.code,
							symbol: definition.symbols?.[0] ?? definition.code,
						},
						canonicalValue: {
							code: definition.code,
							symbol: definition.symbols?.[0] ?? definition.code,
						},
						stable: true,
					};
				}
				for (const symbol of definition.symbols ?? []) {
					if (
						symbol.toLocaleLowerCase(config.locales as string) === normalized
					) {
						return {
							valid: true,
							value: { code: definition.code, symbol },
							canonicalValue: { code: definition.code, symbol },
							stable: true,
						};
					}
				}
			}
			for (const [code, aliases] of Object.entries(config.currencies ?? {})) {
				if (code.toLocaleLowerCase(config.locales as string) === normalized) {
					return {
						valid: true,
						value: { code, symbol: aliases[0] ?? code },
						canonicalValue: { code, symbol: aliases[0] ?? code },
						stable: true,
					};
				}
				for (const alias of aliases) {
					if (
						alias.toLocaleLowerCase(config.locales as string) === normalized
					) {
						return {
							valid: true,
							value: { code, symbol: alias },
							canonicalValue: { code, symbol: alias },
							stable: true,
						};
					}
				}
			}
			return { valid: false, stable: true };
		},
		"currency-amount": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).currency;
			const parsed = parseNumericValue(input, config ?? {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-year": (_id, input) => {
			const parsed = parseNumericValue(input, {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-month": (_id, input) => {
			const parsed = parseNumericValue(input, {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-day": (_id, input) => {
			const parsed = parseNumericValue(input, {});
			return parsed.parsed
				? result(parsed.parsed.value, parsed.diagnostics)
				: result(undefined, parsed.diagnostics);
		},
		"date-month-name": (_id, input, request) => {
			const config = (request?.grammar ?? grammar).date;
			const monthNames = config?.options?.monthNames ?? [];
			const monthAliases = config?.options?.monthAliases ?? [];
			const locales = (request?.grammar ?? grammar).localization?.locale;
			const normalized = input.trim().toLocaleLowerCase(locales as string);
			const allNames = [...monthNames, ...monthAliases.flat()];
			const match = allNames.find(
				(name) => name.toLocaleLowerCase(locales as string) === normalized,
			);
			return match ? result(match, []) : { valid: false, stable: true };
		},
	};
	terminals.numeric = terminals.number!;
	terminals.cadence = terminals.frequency!;
	for (const namespace of [
		"canonical-id",
		"literal",
		"resolver",
		"fundamental",
		"extraction",
		"number-word",
	] as const) {
		terminals[`alias:${namespace}`] = (_id, input, request) => {
			const resolution = grammar.aliases
				? resolveAlias(
						grammar.aliases,
						namespace,
						input,
						aliasContext(request?.context),
						options.aliasResolvers,
					)
				: undefined;
			if (!resolution) return { valid: false, stable: true };
			return {
				valid: true,
				value: resolution.target.value,
				canonicalValue: resolution.target,
				displayValue: resolution.spelling,
				metadata: {
					definitionId: resolution.definitionId,
					namespace: resolution.namespace,
					precision: resolution.target.precision,
				},
				stable: true,
			};
		};
	}
	return terminals;
}

/**
 * Async terminal set for authored templates containing resolver-backed
 * concepts. A concept is accepted only after the configured resolver returns
 * a canonical resolution.
 */
export function createAsyncBuiltinTerminals(
	options: BuiltinTerminalOptions,
): Readonly<Record<string, AsyncTerminalParser>> {
	const syncTerminals = createBuiltinTerminals(options);
	const asyncTerminals: Record<string, AsyncTerminalParser> = {
		...syncTerminals,
		concept: async (_id, input, request) => {
			const config = (request?.grammar ?? options.grammar).quantity;
			const resolver = config.conceptResolver;
			if (!resolver) return { valid: false, stable: true };
			try {
				const resolution = await resolver(input.trim(), {
					locales: config.locales,
					packagingUnit:
						(request?.context?.packagingUnit as string | undefined) ??
						undefined,
				});
				if (!resolution?.conceptId) return { valid: false, stable: true };
				return {
					valid: true,
					value: resolution,
					canonicalValue: {
						conceptId: resolution.conceptId,
						term: resolution.canonicalTerm ?? input.trim(),
						rawText: input.trim(),
						...(resolution.standardCode
							? { standardCode: resolution.standardCode }
							: {}),
						...(resolution.metadata ? { metadata: resolution.metadata } : {}),
					},
					stable: true,
				};
			} catch {
				return { valid: false, stable: true };
			}
		},
	};
	return asyncTerminals;
}

function aliasContext(
	context: Readonly<Record<string, unknown>> | undefined,
): ResolverContext | undefined {
	const nowUtc = context?.nowUtc;
	if (
		!(nowUtc instanceof Date) ||
		typeof context?.timezone !== "string" ||
		typeof context?.locale !== "string" ||
		typeof context?.calendar !== "string"
	)
		return undefined;
	return {
		nowUtc,
		timezone: context.timezone,
		locale: context.locale,
		calendar: context.calendar,
	};
}
