import type { CompiledDomainGrammar } from "../../contracts/extension-config";
import type { AliasResolver } from "../aliases";

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
