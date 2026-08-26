export interface ValueFormatConfig<
	TToken extends string = string,
	TOptions = unknown,
> {
	readonly id?: string;
	readonly tokens: readonly TToken[];
	readonly separators: readonly string[];
	readonly options?: TOptions;
}

export const FREQUENCY_TOKENS = [
	"INTERVAL_PREFIX",
	"INTERVAL_MAG",
	"INTERVAL_HIGH",
	"INTERVAL_UNIT",
	"RECURRENCE_COUNT",
	"RECURRENCE_CONN",
	"PERIOD",
	"OFFSET_MAG",
	"OFFSET_UNIT",
	"OFFSET_DIR",
	"ANCHOR",
	"PRN_TRIGGER",
	"CONDITION",
] as const;
export type FrequencyToken = (typeof FREQUENCY_TOKENS)[number];

export const QUANTITY_TOKENS = [
	"NUM",
	"NUM_LOW",
	"NUM_HIGH",
	"UNIT",
	"PKG_CLASSIFIER",
	"FILLER",
	"OP_PREFIX",
	"OP_POSTFIX",
	"OP_SUFFIX",
	"STAT_QUALIFIER",
	"CONCEPT",
] as const;
export type QuantityToken = (typeof QUANTITY_TOKENS)[number];

export const CURRENCY_TOKENS = [
	"SYM",
	"CODE",
	"AMOUNT",
	"SUBUNITS",
	"OP",
] as const;
export type CurrencyToken = (typeof CURRENCY_TOKENS)[number];

export const RATE_TOKENS = [
	"NUMERATOR",
	"RATE_DELIM",
	"DENOMINATOR",
	"DIVISOR_MAG",
] as const;
export type RateToken = (typeof RATE_TOKENS)[number];

export const DURATION_TOKENS = [
	"DUR_MAG",
	"DUR_UNIT",
	"DUR_DELIM",
	"DUR_DIR",
] as const;
export type DurationToken = (typeof DURATION_TOKENS)[number];

export const RELATIVE_TIME_TOKENS = [
	"REL_DIR",
	"REL_UNIT",
	"REL_ALIAS",
] as const;
export type RelativeTimeToken = (typeof RELATIVE_TIME_TOKENS)[number];

export const DATE_TIME_TOKENS = [
	"YYYY",
	"YY",
	"MM_name",
	"MM",
	"DDD",
	"DD",
	"HH",
	"min",
	"SS",
	"ampm",
	"tz",
] as const;
export type DateTimeToken = (typeof DATE_TIME_TOKENS)[number];

export type DomainToken =
	| FrequencyToken
	| QuantityToken
	| CurrencyToken
	| RateToken
	| DurationToken
	| RelativeTimeToken
	| DateTimeToken;

export type ValueTokenDomain =
	| "frequency"
	| "quantity"
	| "currency"
	| "rate"
	| "duration"
	| "relative-time"
	| "date-time";

export interface ValueTokenDescriptor {
	readonly id: string;
	readonly domain: ValueTokenDomain;
	readonly labelKey: string;
	readonly descriptionKey: string;
	readonly available?: boolean;
}

const TOKEN_DOMAIN_GROUPS: Readonly<
	Record<ValueTokenDomain, readonly string[]>
> = {
	frequency: FREQUENCY_TOKENS,
	quantity: QUANTITY_TOKENS,
	currency: CURRENCY_TOKENS,
	rate: RATE_TOKENS,
	duration: DURATION_TOKENS,
	"relative-time": RELATIVE_TIME_TOKENS,
	"date-time": DATE_TIME_TOKENS,
};

export function getValueTokenDescriptors(
	domain: ValueTokenDomain,
	runtimeAvailable?: ReadonlySet<string>,
): readonly ValueTokenDescriptor[] {
	return TOKEN_DOMAIN_GROUPS[domain].map((id) => ({
		id,
		domain,
		labelKey: `settings.tokens.${domain}.${id}.label`,
		descriptionKey: `settings.tokens.${domain}.${id}.description`,
		...(runtimeAvailable ? { available: runtimeAvailable.has(id) } : {}),
	}));
}
