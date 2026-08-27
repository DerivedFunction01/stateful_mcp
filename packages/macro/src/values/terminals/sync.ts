import { createDateTimeTerminals } from "../date-time";
import { createFrequencyTerminals } from "../frequency";
import type { TerminalParser } from "../recipes";
import { createAliasTerminals } from "./alias";
import { createCurrencyTerminals } from "./currency";
import { createQuantityTerminals } from "./quantity";
import type { BuiltinTerminalOptions } from "./types";

export function createBuiltinTerminals(
	options: BuiltinTerminalOptions,
): Readonly<Record<string, TerminalParser>> {
	const terminals: Record<string, TerminalParser> = {
		...createQuantityTerminals(options),
		...createCurrencyTerminals(options),
		...createDateTimeTerminals(options),
		...createFrequencyTerminals(options),
		...createAliasTerminals(options),
	};
	terminals.numeric = terminals.number!;
	terminals.cadence = terminals.frequency!;
	return terminals;
}
