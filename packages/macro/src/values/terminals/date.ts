import { parseNumericValue } from "../numeric";
import type { TerminalParser } from "../recipes";
import { result } from "./shared";
import type { BuiltinTerminalOptions } from "./types";

export function createDateTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	return {
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
}
