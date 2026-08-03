import type { CommandSyntaxProfile } from "../commands/command-syntax-profile";
import type { FormattedQuantityValue } from "./field-types";

export interface QuantityFormatContext {
	syntaxProfile?: CommandSyntaxProfile;
	locale?: string;
	targetSchema?: string;
	targetField?: string;
	unitDisplayStyle?: "short" | "long" | "narrow";
}

export function formatQuantity(
	value: unknown,
	context: QuantityFormatContext = {},
): FormattedQuantityValue {
	if (!value || typeof value !== "object")
		return { kind: "unknown", text: String(value ?? ""), approximate: false };
	const record = value as Record<string, unknown>;
	const formatNumber = (number: number) =>
		new Intl.NumberFormat(context.locale ?? "en-US").format(number);
	const unit =
		typeof record.unit === "string"
			? record.unit
			: typeof record.unit === "object" &&
					record.unit &&
					"display" in record.unit
				? String(record.unit.display)
				: "";
	const prefix =
		typeof record.operator === "string"
			? ({ eq: "=", gt: ">", gte: "≥", lt: "<", lte: "≤" }[record.operator] ??
				String(record.operator))
			: "";
	if (record.low || record.high) {
		const low = record.low as Record<string, unknown> | undefined;
		const high = record.high as Record<string, unknown> | undefined;
		return {
			kind: "range",
			text: `${low?.magnitude === undefined ? "?" : formatNumber(Number(low.magnitude))}–${high?.magnitude === undefined ? "?" : formatNumber(Number(high.magnitude))}${unit ? ` ${unit}` : ""}`,
			approximate: Boolean(low?.is_approximate || high?.is_approximate),
		};
	}
	if (typeof record.magnitude !== "number")
		return { kind: "unknown", text: String(value), approximate: false };
	return {
		kind: prefix ? "comparison" : "exact",
		text: `${prefix ? `${prefix} ` : ""}${formatNumber(record.magnitude)}${unit ? ` ${unit}` : ""}`,
		approximate: record.is_approximate === true,
	};
}
