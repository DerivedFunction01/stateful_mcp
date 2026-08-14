export interface QuantityGrammarConfig {
	unitAliases: Readonly<Record<string, string>>;
	rangeDelimiters: readonly string[];
	operatorAliases?: Readonly<Record<string, string>>;
	statisticalAliases?: Readonly<Record<string, string>>;
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
	if (operator && !policy.allowOperator) return diagnostic("operator_not_allowed", "Operators are not allowed");
	const statistic = consumeAlias(text, config.statisticalAliases);
	if (statistic) text = statistic.remainder;
	if (statistic && policy.statistics === "reject") return diagnostic("statistics_not_allowed", "Statistical qualifiers are not allowed");
	const dataPointMatch = text.match(/^(\d+)\s+/u);
	let dataPointCount: number | undefined;
	if (dataPointMatch && config.dataPointCountAliases?.some((alias) => text.toLocaleLowerCase().includes(` ${alias.toLocaleLowerCase()}`))) {
		dataPointCount = Number(dataPointMatch[1]);
		text = text.slice(dataPointMatch[0].length).trimStart();
	}
	if (dataPointCount !== undefined && !policy.allowDataPointCount) return diagnostic("data_point_count_not_allowed", "Data-point counts are not allowed");
	const range = splitRange(text, config.rangeDelimiters);
	if (range && !policy.allowRange) return diagnostic("range_not_allowed", "Ranges are not allowed");
	const lower = parseNumberAndUnit(range?.[0] ?? text, config);
	const upper = range?.[1] ? parseNumberAndUnit(range[1], config) ?? parseNumberOnly(range[1], lower?.unit, config) : undefined;
	if (!lower || (range?.[1] && !upper)) return diagnostic("invalid_quantity", `Unable to parse quantity '${rawText}'`);
	if (upper && upper.unit !== lower.unit) return diagnostic("invalid_range", "Range endpoints must use the same unit");
	if (upper && upper.value < lower.value) return diagnostic("invalid_range", "Range lower bound must not exceed upper bound");
	if (policy.allowedUnits && !policy.allowedUnits.includes(lower.unit)) return diagnostic("unit_not_allowed", `Unit '${lower.unit}' is not allowed`);
	const diagnostics: Array<{ code: string; message: string }> = [];
	if (statistic && policy.statistics === "ignore") diagnostics.push({ code: "statistics_ignored", message: "Statistical qualifier was ignored" });
	return {
		value: { lower: lower.value, upper: upper?.value, unit: lower.unit, operator: operator?.value, statisticalType: policy.statistics === "accept" ? statistic?.value : undefined, dataPointCount, rawText },
		diagnostics,
	};
}

function consumeAlias(text: string, aliases?: Readonly<Record<string, string>>): { value: string; remainder: string } | undefined {
	for (const [alias, value] of Object.entries(aliases ?? {}).sort((left, right) => right[0].length - left[0].length)) {
		if (text.toLocaleLowerCase().startsWith(alias.toLocaleLowerCase()) && text.slice(alias.length).trim()) return { value, remainder: text.slice(alias.length).trimStart() };
	}
	return undefined;
}

function splitRange(text: string, delimiters: readonly string[]): [string, string] | undefined {
	for (const delimiter of delimiters) {
		const index = text.indexOf(delimiter);
		if (index > 0 && index < text.length - delimiter.length) return [text.slice(0, index).trim(), text.slice(index + delimiter.length).trim()];
	}
	return undefined;
}

function parseNumberAndUnit(text: string, config: QuantityGrammarConfig): { value: number; unit: string } | undefined {
	const decimal = config.decimalSeparator ?? ".";
	const match = text.trim().match(new RegExp(`^([+-]?\\d+(?:${decimal === "," ? "," : "\\."}\\d+)?)\\s*(.+)$`, "u"));
	if (!match) return undefined;
	const unit = resolveUnit(match[2]!, config.unitAliases);
	const value = Number(decimal === "," ? match[1]!.replace(",", ".") : match[1]);
	return unit && Number.isFinite(value) ? { value, unit } : undefined;
}

function parseNumberOnly(text: string, unit: string | undefined, config: QuantityGrammarConfig): { value: number; unit: string } | undefined {
	if (!unit) return undefined;
	const decimal = config.decimalSeparator ?? ".";
	const value = Number(decimal === "," ? text.trim().replace(",", ".") : text.trim());
	return Number.isFinite(value) ? { value, unit } : undefined;
}

function resolveUnit(input: string, aliases: Readonly<Record<string, string>>): string | undefined {
	const normalized = input.trim().toLocaleLowerCase();
	return Object.entries(aliases).find(([alias]) => alias.toLocaleLowerCase() === normalized)?.[1];
}

function diagnostic(code: string, message: string): QuantityGrammarResolution {
	return { diagnostics: [{ code, message }] };
}
