import type { MessageParam } from "@stateful-mcp/macro-protocol";
import type { CompiledDomainGrammar } from "../contracts/extension-config";
import {
	type AliasResolver,
	type ResolverContext,
	resolveAlias,
} from "./aliases";
import { parseCurrency } from "./currency";
import {
	buildDatePatternString,
	buildDayPeriodMap,
	compileDateRegex,
	createDateTimeRegistry,
	type DateTimeComponents,
	parseRelativeTemporal,
	resolveTwoDigitYear,
} from "./date-time";
import { parseCadenceSchedule } from "./frequency";
import { checkNumericBounds, parseNumericValue } from "./numeric";
import { resolveOperator } from "./operators";
import { parseQuantity, resolveUnitAlias } from "./quantity";
import { parseCompoundRate } from "./rates";
import type {
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
	"currency",
	"concept",
	"text",
	"unit",
	"operator",
	"statistic",
	"date",
	"date-time",
	"relative-time",
	"frequency",
	"cadence",
	"rate",
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
			const parsed = parseQuantity(
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
							messageParams: { argumentId: request.policy.path },
						},
					],
				};
			}
			return result(parsed.value, parsed.diagnostics);
		},
		currency: (_id, input, request) => {
			const parsed = parseCurrency(
				input,
				(request?.grammar ?? grammar).currency ?? {},
				{
					allowedCurrencies: request?.policy?.allowedCurrencies,
				},
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
		date: (_id, input, request) =>
			parseDateTerminal(input, request?.grammar ?? grammar, "date"),
		"date-time": (_id, input, request) =>
			parseDateTerminal(input, request?.grammar ?? grammar, "datetime"),
		"relative-time": (_id, input, request) => {
			const context = request?.context;
			if (
				!(context?.nowUtc instanceof Date) ||
				typeof context.timezone !== "string" ||
				typeof context.calendar !== "string"
			)
				return { valid: false, stable: false };
			const value = parseRelativeTemporal(
				input,
				(request?.grammar ?? grammar).relativeTemporal ?? {},
			);
			return value
				? {
					valid: true,
					canonicalValue: value,
					displayValue: input.trim(),
					stable: true,
				}
				: { valid: false, stable: true };
		},
		frequency: (_id, input, request) => {
			const parsed = parseCadenceSchedule(
				input,
				(request?.grammar ?? grammar).frequency ?? {},
			);
			return result(parsed.value, parsed.diagnostics);
		},
		rate: (_id, input, request) => {
			const parsed = parseCompoundRate(
				input,
				(request?.grammar ?? grammar).rates ?? {},
				{
					quantityPolicy: request?.policy?.quantityConsumerPolicy,
				},
			);
			return result(parsed.value, parsed.diagnostics);
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

function parseDateTerminal(
	input: string,
	grammar: CompiledDomainGrammar,
	kind: "date" | "datetime",
): TerminalParseResult {
	const registry = grammar.dateTime ?? createDateTimeRegistry(grammar.date);
	const definitions = Object.values(registry.formats)
		.filter(
			(definition) =>
				definition.parserEnabled !== false && definition.kind === kind,
		)
		.sort(
			(left, right) => (right.parserPriority ?? 0) - (left.parserPriority ?? 0),
		);
	for (const definition of definitions) {
		const separators =
			definition.separators.length === definition.tokens.length - 1
				? definition.separators
				: definition.separators.slice(1);
		const pattern = buildDatePatternString(definition.tokens, separators, {
			...definition.options,
			exact: true,
		});
		const match = compileDateRegex(pattern.pattern, "u").exec(input.trim());
		if (!match?.groups) continue;
		const components: DateTimeComponents = {};
		if (match.groups.YYYY) components.year = Number(match.groups.YYYY);
		else if (match.groups.YY)
			components.year = resolveTwoDigitYear(
				match.groups.YY,
				definition.options?.twoDigitYear,
			);
		if (match.groups.MM) components.month = Number(match.groups.MM);
		if (match.groups.DD) components.day = Number(match.groups.DD);
		if (match.groups.DDD) components.dayOfYear = Number(match.groups.DDD);
		if (match.groups.HH) components.hour = Number(match.groups.HH);
		if (match.groups.min) components.minute = Number(match.groups.min);
		if (match.groups.SS) components.second = Number(match.groups.SS);
		if (match.groups.ampm) {
			const periods = buildDayPeriodMap(definition.options?.dayPeriods);
			components.dayPeriod =
				periods.get(match.groups.ampm.toLocaleLowerCase()) ??
				(match.groups.ampm.toLocaleLowerCase().startsWith("p") ? "pm" : "am");
		}
		if (match.groups.tz) components.timeZone = match.groups.tz;
		return {
			valid: true,
			canonicalValue: {
				kind: definition.kind,
				formatId: definition.id,
				components,
			},
			displayValue: input.trim(),
			metadata: { formatId: definition.id },
			stable: true,
		};
	}
	return { valid: false, stable: true };
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
