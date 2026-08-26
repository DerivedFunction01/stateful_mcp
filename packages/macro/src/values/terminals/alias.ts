import type { ResolverContext } from "../aliases";
import { resolveAlias } from "../aliases";
import type { TerminalParser } from "../recipes";
import type { BuiltinTerminalOptions } from "./types";

export function createAliasTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	const terminals: Record<string, TerminalParser> = {
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
	};
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
