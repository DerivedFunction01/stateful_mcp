import type {
	MeasurementOperator,
	ValueType,
} from "../schemas/schemas-interface/measurement";

export interface QuantityGrammarConfig {
	unitAliases: Readonly<Record<string, string>>;
	rangeDelimiters: readonly string[];
	operatorAliases?: Readonly<Record<string, MeasurementOperator>>;
	statisticalAliases?: Readonly<Record<string, ValueType>>;
	dataPointCountAliases?: readonly string[];
	decimalSeparator?: "." | ",";
}

export interface QuantityConsumerPolicy {
	allowedUnits?: readonly string[];
	allowRange: boolean;
	allowOperator: boolean;
	statistics: "accept" | "ignore" | "reject";
	allowDataPointCount: boolean;
}

export interface QuantityGrammarResult {
	lower: number;
	upper?: number;
	unit: string;
	operator?: MeasurementOperator;
	statisticalType?: ValueType;
	dataPointCount?: number;
	rawText: string;
}

export interface QuantityGrammarDiagnostic {
	code:
		| "invalid_quantity"
		| "invalid_range"
		| "unit_not_allowed"
		| "operator_not_allowed"
		| "range_not_allowed"
		| "statistics_not_allowed"
		| "statistics_ignored"
		| "data_point_count_not_allowed";
	message: string;
}

export interface QuantityGrammarResolution {
	value?: QuantityGrammarResult;
	diagnostics: QuantityGrammarDiagnostic[];
}

export function parseQuantity(
	input: string,
	config: QuantityGrammarConfig,
	policy: QuantityConsumerPolicy,
): QuantityGrammarResolution {
	const rawText = input.trim();
	if (!rawText) return diagnostic("invalid_quantity", "Quantity is empty");

	let text = rawText;
	let operator: MeasurementOperator | undefined;
	for (const [alias, mapped] of Object.entries(config.operatorAliases ?? {})) {
		if (!text.toLocaleLowerCase().startsWith(alias.toLocaleLowerCase())) continue;
		const remainder = text.slice(alias.length).trimStart();
		if (!remainder) continue;
		operator = mapped;
		text = remainder;
		break;
	}
	if (operator && !policy.allowOperator)
		return diagnostic(
			"operator_not_allowed",
			"This field does not accept measurement operators",
		);

	let statisticalType: ValueType | undefined;
	for (const [alias, mapped] of Object.entries(config.statisticalAliases ?? {})) {
		if (!text.toLocaleLowerCase().startsWith(alias.toLocaleLowerCase())) continue;
		const remainder = text.slice(alias.length).trimStart();
		if (!remainder) continue;
		statisticalType = mapped;
		text = remainder;
		break;
	}
	if (statisticalType && policy.statistics === "reject")
		return diagnostic(
			"statistics_not_allowed",
			"Statistical qualifiers are not allowed for this field",
		);

	const dataPointMatch = text.match(/^(\d+)\s+/u);
	let dataPointCount: number | undefined;
	if (dataPointMatch && config.dataPointCountAliases?.some((alias) =>
		text.toLocaleLowerCase().includes(` ${alias.toLocaleLowerCase()}`),
	)) {
		dataPointCount = Number(dataPointMatch[1]);
		text = text.slice(dataPointMatch[0].length).trimStart();
	}
	if (dataPointCount !== undefined && !policy.allowDataPointCount)
		return diagnostic(
			"data_point_count_not_allowed",
			"Data-point counts are not allowed for this field",
		);

	const range = splitRange(text, config.rangeDelimiters);
	if (range && !policy.allowRange)
		return diagnostic("range_not_allowed", "Ranges are not allowed for this field");
	const lowerText = range?.[0] ?? text;
	const upperText = range?.[1];
	const upperParsed = upperText
		? parseNumberAndUnit(upperText, config)
		: undefined;
	const lowerParsed =
		parseNumberAndUnit(lowerText, config) ??
		(upperParsed ? parseNumberOnly(lowerText, upperParsed.unit, config) : undefined);
	if (!lowerParsed || (upperText && !upperParsed))
		return diagnostic(
			"invalid_quantity",
			`Unable to parse quantity '${rawText}' using the active profile`,
		);
	if (upperParsed && upperParsed.unit !== lowerParsed.unit)
		return diagnostic(
			"invalid_range",
			"Quantity range endpoints must use the same unit",
		);
	if (policy.allowedUnits && !policy.allowedUnits.includes(lowerParsed.unit))
		return diagnostic(
			"unit_not_allowed",
			`Unit '${lowerParsed.unit}' is not allowed for this field`,
		);
	if (upperParsed && upperParsed.value < lowerParsed.value)
		return diagnostic(
			"invalid_range",
			"Quantity range lower bound must not exceed its upper bound",
		);

	const diagnostics: QuantityGrammarDiagnostic[] = [];
	if (statisticalType && policy.statistics === "ignore")
		diagnostics.push({
			code: "statistics_ignored",
			message: "Statistical qualifier was ignored by the consumer policy",
		});
	return {
		value: {
			lower: lowerParsed.value,
			upper: upperParsed?.value,
			unit: lowerParsed.unit,
			operator,
			statisticalType:
				policy.statistics === "accept" ? statisticalType : undefined,
			dataPointCount,
			rawText,
		},
		diagnostics,
	};
}

function parseNumberAndUnit(
	input: string,
	config: QuantityGrammarConfig,
): { value: number; unit: string } | undefined {
	const decimal = config.decimalSeparator ?? ".";
	const numberPattern = decimal === "," ? "[+-]?\\d+(?:,\\d+)?" : "[+-]?\\d+(?:\\.\\d+)?";
	const match = input.trim().match(new RegExp(`^(${numberPattern})\\s*(.+)$`, "u"));
	if (!match) return undefined;
	const value = Number(decimal === "," ? match[1]!.replace(",", ".") : match[1]);
	const key = match[2]!.trim().toLocaleLowerCase();
	const unit = config.unitAliases[key] ?? config.unitAliases[match[2]!.trim()!];
	return unit && Number.isFinite(value) ? { value, unit } : undefined;
}

function parseNumberOnly(
	input: string,
	unit: string,
	config: QuantityGrammarConfig,
): { value: number; unit: string } | undefined {
	const decimal = config.decimalSeparator ?? ".";
	const pattern = decimal === "," ? "^[+-]?\\d+(?:,\\d+)?$" : "^[+-]?\\d+(?:\\.\\d+)?$";
	const normalized = input.trim();
	if (!new RegExp(pattern, "u").test(normalized)) return undefined;
	const value = Number(decimal === "," ? normalized.replace(",", ".") : normalized);
	return Number.isFinite(value) ? { value, unit } : undefined;
}

function splitRange(
	input: string,
	delimiters: readonly string[],
): [string, string] | undefined {
	for (const delimiter of delimiters) {
		const index = input.toLocaleLowerCase().indexOf(delimiter.toLocaleLowerCase());
		if (index <= 0) continue;
		const left = input.slice(0, index).trim();
		const right = input.slice(index + delimiter.length).trim();
		if (left && right) return [left, right];
	}
	return undefined;
}

function diagnostic(
	code: QuantityGrammarDiagnostic["code"],
	message: string,
): QuantityGrammarResolution {
	return { diagnostics: [{ code, message }] };
}
