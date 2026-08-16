export interface QuantityGrammarConfig {
	unitAliases: Readonly<Record<string, readonly string[]>>;
	rangeDelimiters: readonly string[];
	operatorAliases?: Readonly<Record<string, readonly string[]>>;
	statisticalAliases?: Readonly<Record<string, readonly string[]>>;
	dataPointCountAliases?: readonly string[];
	decimalSeparator?: "." | ",";
}

export const QUANTITY_STATISTICS_POLICIES = [
	"accept",
	"ignore",
	"reject",
] as const;
export type QuantityStatisticsPolicy =
	(typeof QUANTITY_STATISTICS_POLICIES)[number];

export interface QuantityConsumerPolicy {
	allowedUnits?: readonly string[];
	allowRange: boolean;
	allowOperator: boolean;
	statistics: QuantityStatisticsPolicy;
	allowDataPointCount: boolean;
}

export interface QuantityGrammarResult {
	lower: number;
	upper?: number;
	unit: string;
	operator?: string;
	statisticalType?: string;
	dataPointCount?: number;
	rawText: string;
}

export interface QuantityGrammarResolution {
	value?: QuantityGrammarResult;
	diagnostics: Array<{ code: string; message: string }>;
}

export function parseQuantity(
	input: string,
	config: QuantityGrammarConfig,
	policy: QuantityConsumerPolicy,
): QuantityGrammarResolution {
	const rawText = input.trim();
	if (!rawText) return diagnostic("invalid_quantity", "Quantity is empty");
	let text = rawText;
	const operator = consumeAlias(text, config.operatorAliases);
	if (operator) text = operator.remainder;
	if (operator && !policy.allowOperator)
		return diagnostic("operator_not_allowed", "Operators are not allowed");
	const statistic = consumeAlias(text, config.statisticalAliases);
	if (statistic) text = statistic.remainder;
	if (statistic && policy.statistics === "reject")
		return diagnostic(
			"statistics_not_allowed",
			"Statistical qualifiers are not allowed",
		);
	const dataPointMatch = text.match(/^(\d+)\s+/u);
	let dataPointCount: number | undefined;
	if (
		dataPointMatch &&
		config.dataPointCountAliases?.some((alias) =>
			text.toLocaleLowerCase().includes(` ${alias.toLocaleLowerCase()}`),
		)
	) {
		dataPointCount = Number(dataPointMatch[1]);
		text = text.slice(dataPointMatch[0].length).trimStart();
	}
	if (dataPointCount !== undefined && !policy.allowDataPointCount)
		return diagnostic(
			"data_point_count_not_allowed",
			"Data-point counts are not allowed",
		);
	const range = splitRange(text, config.rangeDelimiters);
	if (range && !policy.allowRange)
		return diagnostic("range_not_allowed", "Ranges are not allowed");
	const lower = parseNumberAndUnit(range?.[0] ?? text, config);
	const upper = range?.[1]
		? (parseNumberAndUnit(range[1], config) ??
			parseNumberOnly(range[1], lower?.unit, config))
		: undefined;
	if (!lower || (range?.[1] && !upper))
		return diagnostic(
			"invalid_quantity",
			`Unable to parse quantity '${rawText}'`,
		);
	if (upper && upper.unit !== lower.unit)
		return diagnostic(
			"invalid_range",
			"Range endpoints must use the same unit",
		);
	if (upper && upper.value < lower.value)
		return diagnostic(
			"invalid_range",
			"Range lower bound must not exceed upper bound",
		);
	if (policy.allowedUnits && !policy.allowedUnits.includes(lower.unit))
		return diagnostic(
			"unit_not_allowed",
			`Unit '${lower.unit}' is not allowed`,
		);
	const diagnostics: Array<{ code: string; message: string }> = [];
	if (statistic && policy.statistics === "ignore")
		diagnostics.push({
			code: "statistics_ignored",
			message: "Statistical qualifier was ignored",
		});
	return {
		value: {
			lower: lower.value,
			upper: upper?.value,
			unit: lower.unit,
			operator: operator?.value,
			statisticalType:
				policy.statistics === "accept" ? statistic?.value : undefined,
			dataPointCount,
			rawText,
		},
		diagnostics,
	};
}

function consumeAlias(
	text: string,
	aliases?: Readonly<Record<string, readonly string[] | string>>,
): { value: string; remainder: string } | undefined {
	if (!aliases) return undefined;
	const candidates: Array<{ canonical: string; alias: string }> = [];
	for (const [canonical, aliasVal] of Object.entries(aliases)) {
		candidates.push({ canonical, alias: canonical });
		if (Array.isArray(aliasVal)) {
			for (const alias of aliasVal) {
				if (alias.toLocaleLowerCase() !== canonical.toLocaleLowerCase()) {
					candidates.push({ canonical, alias });
				}
			}
		} else if (typeof aliasVal === "string") {
			if (aliasVal.toLocaleLowerCase() !== canonical.toLocaleLowerCase()) {
				candidates.push({ canonical, alias: aliasVal });
			}
		}
	}
	candidates.sort((left, right) => right.alias.length - left.alias.length);

	const lowerText = text.toLocaleLowerCase();
	for (const { canonical, alias } of candidates) {
		const lowerAlias = alias.toLocaleLowerCase();
		if (lowerText.startsWith(lowerAlias)) {
			const remainder = text.slice(alias.length).trimStart();
			if (remainder.length > 0 || alias.length === text.length) {
				return { value: canonical, remainder };
			}
		}
	}
	return undefined;
}

function splitRange(
	text: string,
	delimiters: readonly string[],
): [string, string] | undefined {
	for (const delimiter of delimiters) {
		const index = text.indexOf(delimiter);
		if (index > 0 && index < text.length - delimiter.length)
			return [
				text.slice(0, index).trim(),
				text.slice(index + delimiter.length).trim(),
			];
	}
	return undefined;
}

function parseNumberAndUnit(
	text: string,
	config: QuantityGrammarConfig,
): { value: number; unit: string } | undefined {
	const decimal = config.decimalSeparator ?? ".";
	const match = text
		.trim()
		.match(
			new RegExp(
				`^([+-]?\\d+(?:${decimal === "," ? "," : "\\."}\\d+)?)\\s*(.+)$`,
				"u",
			),
		);
	if (!match) return undefined;
	const unit = resolveUnit(match[2]!, config.unitAliases);
	const value = Number(
		decimal === "," ? match[1]!.replace(",", ".") : match[1],
	);
	return unit && Number.isFinite(value) ? { value, unit } : undefined;
}

function parseNumberOnly(
	text: string,
	unit: string | undefined,
	config: QuantityGrammarConfig,
): { value: number; unit: string } | undefined {
	if (!unit) return undefined;
	const decimal = config.decimalSeparator ?? ".";
	const value = Number(
		decimal === "," ? text.trim().replace(",", ".") : text.trim(),
	);
	return Number.isFinite(value) ? { value, unit } : undefined;
}

function resolveUnit(
	input: string,
	aliases: Readonly<Record<string, readonly string[]>>,
): string | undefined {
	const normalized = input.trim().toLocaleLowerCase();
	for (const [canonicalUnit, aliasList] of Object.entries(aliases)) {
		if (canonicalUnit.toLocaleLowerCase() === normalized) {
			return canonicalUnit;
		}
		if (Array.isArray(aliasList)) {
			if (
				aliasList.some(
					(alias) => alias.toLocaleLowerCase() === normalized,
				)
			) {
				return canonicalUnit;
			}
		} else if (
			typeof aliasList === "string" &&
			(aliasList as string).toLocaleLowerCase() === normalized
		) {
			return canonicalUnit;
		}
	}
	return undefined;
}

function diagnostic(code: string, message: string): QuantityGrammarResolution {
	return { diagnostics: [{ code, message }] };
}
