import type { NumericalSyntaxProfile } from "../values/numerical-syntax-profile";
import type { SetupPrimitiveProfile } from "./setup-types";

/** Applies only explicitly confirmed setup values over the bootstrap profile. */
export function applySetupPrimitiveProfile(
	base: NumericalSyntaxProfile,
	primitive: SetupPrimitiveProfile,
): NumericalSyntaxProfile {
	const temporalAliases = Object.fromEntries(
		Object.entries(primitive.temporalAliases ?? {})
			.map(([alias, value]) => [alias, Number(value)])
			.filter(([, value]) => Number.isFinite(value)),
	);
	const unitAliases = Object.fromEntries(
		Object.entries(primitive.unitAliases ?? {})
			.filter(([, value]) => value.length > 0),
		) as NumericalSyntaxProfile["temporal"]["unitAliases"];
	return {
		...base,
		temporal: {
			...base.temporal,
			...(primitive.dateTimeFormats !== undefined
				? { dateTimeFormats: primitive.dateTimeFormats }
				: {}),
			...(Object.keys(temporalAliases).length > 0
				? { relativeDayAliases: { ...base.temporal.relativeDayAliases, ...temporalAliases } }
				: {}),
			...(primitive.rangeDelimiters?.length
				? { rangeDelimiters: primitive.rangeDelimiters }
				: {}),
		},
		...(primitive.decimalSeparator || primitive.thousandsSeparator
			? {
					numericFormat: {
						...base.numericFormat,
						...(primitive.decimalSeparator ? { decimalPoint: primitive.decimalSeparator } : {}),
						...(primitive.thousandsSeparator ? { thousandsSeparator: primitive.thousandsSeparator } : {}),
					},
				}
			: {}),
	};
}
