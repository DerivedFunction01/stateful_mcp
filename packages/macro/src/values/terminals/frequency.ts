import { parseNumericValue } from "../numeric";
import type { TerminalParser } from "../recipes";
import { result } from "./shared";
import type { BuiltinTerminalOptions } from "./types";

export function createFrequencyTerminals(
	options: BuiltinTerminalOptions,
): Record<string, TerminalParser> {
	const { grammar } = options;
	return {
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
	};
}
