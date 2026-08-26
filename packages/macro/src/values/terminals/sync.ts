import type { TerminalParser } from "../recipes";
import { createAliasTerminals } from "./alias";
import { createCurrencyTerminals } from "./currency";
import { createDateTerminals } from "./date";
import { createFrequencyTerminals } from "./frequency";
import { createQuantityTerminals } from "./quantity";
import type { BuiltinTerminalOptions } from "./types";

export function createBuiltinTerminals(
	options: BuiltinTerminalOptions,
): Readonly<Record<string, TerminalParser>> {
	const terminals: Record<string, TerminalParser> = {
		...createQuantityTerminals(options),
		...createCurrencyTerminals(options),
		...createDateTerminals(options),
		...createFrequencyTerminals(options),
		...createAliasTerminals(options),
	};
	terminals.numeric = terminals.number!;
	terminals.cadence = terminals.frequency!;
	return terminals;
}
