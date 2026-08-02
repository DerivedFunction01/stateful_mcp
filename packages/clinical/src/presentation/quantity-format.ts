import { UNIT_DISPLAY_MAP } from "../schemas/measurement";
import type { ParserSyntaxProfile } from "../store/interfaces";
import type { FormattedQuantityValue } from "./field-types";

export interface QuantityFormatContext {
	profile?: ParserSyntaxProfile;
	locale?: string;
	targetSchema?: string;
	targetField?: string;
	unitDisplayStyle?: "short" | "long" | "narrow";
}
function record(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
function unit(value: unknown): string | undefined {
	if (!record(value)) return undefined;
	if (typeof value.unit === "string") return value.unit;
	return record(value.unit) && typeof value.unit.display === "string"
		? value.unit.display
		: undefined;
}
function number(value: number, context: QuantityFormatContext): string {
	const rule = [...(context.profile?.numericFieldFormats ?? [])]
		.filter(
			(r) =>
				(!context.targetSchema || r.targetSchema === context.targetSchema) &&
				(!context.targetField || r.targetField === context.targetField),
		)
		.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
	const options: Intl.NumberFormatOptions =
		rule?.decimalDigits === undefined
			? {}
			: {
					minimumFractionDigits: rule.decimalDigits,
					maximumFractionDigits: rule.decimalDigits,
				};
	try {
		return new Intl.NumberFormat(context.locale ?? "en-US", options).format(
			value,
		);
	} catch {
		return String(value);
	}
}
function unitText(
	value: string | undefined,
	context: QuantityFormatContext,
): string | undefined {
	if (!value) return undefined;
	const style = context.unitDisplayStyle ?? "short";
	const configured = context.profile?.quantityDisplay?.units?.[value];
	return (
		configured?.[style] ??
		configured?.short ??
		UNIT_DISPLAY_MAP[value as keyof typeof UNIT_DISPLAY_MAP] ??
		value
	);
}
function operator(value: unknown, context: QuantityFormatContext): string {
	if (typeof value !== "string") return "";
	const operators = context.profile?.quantityDisplay?.operators as
		| Record<string, { symbol: string }>
		| undefined;
	const configured = operators?.[value];
	return (
		configured?.symbol ??
		{ eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤" }[value] ??
		value
	);
}
export function formatQuantity(
	value: unknown,
	context: QuantityFormatContext = {},
): FormattedQuantityValue {
	if (!record(value))
		return { kind: "unknown", text: String(value ?? ""), approximate: false };
	const low =
		record(value.low) && typeof value.low.magnitude === "number"
			? value.low
			: undefined;
	const high =
		record(value.high) && typeof value.high.magnitude === "number"
			? value.high
			: undefined;
	if (low || high) {
		const u = unitText(unit(value) ?? unit(low) ?? unit(high), context);
		return {
			kind: "range",
			text: `${low ? number(low.magnitude as number, context) : "?"}–${high ? number(high.magnitude as number, context) : "?"}${u ? ` ${u}` : ""}`,
			approximate: Boolean(low?.is_approximate || high?.is_approximate),
		};
	}
	if (typeof value.magnitude !== "number")
		return { kind: "unknown", text: String(value), approximate: false };
	const op = operator(value.operator, context);
	const approximate = value.is_approximate === true;
	const u = unitText(unit(value), context);
	return {
		kind: op ? "comparison" : "exact",
		text: `${op ? `${op} ` : ""}${number(value.magnitude, context)}${u ? ` ${u}` : ""}${approximate ? " ≈" : ""}`,
		approximate,
	};
}
export function formatQuantityText(
	value: unknown,
	context: QuantityFormatContext = {},
): string {
	return formatQuantity(value, context).text;
}
