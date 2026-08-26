import type { UnitExpression } from "../contracts";

export interface CommonUnitExpressions {
	"m/s": UnitExpression;
	"km/h": UnitExpression;
	"[mi_i]/h": UnitExpression;
	"[ft_i]/s": UnitExpression;
	"m/s2": UnitExpression;
	"km/h2": UnitExpression;
	"[ft_i]/s2": UnitExpression;
	m2: UnitExpression;
	cm2: UnitExpression;
	"L/min": UnitExpression;
	"mL/s": UnitExpression;
	"[gal_us]/min": UnitExpression;
	"kg/s": UnitExpression;
	"g/min": UnitExpression;
	"[lb_av]/h": UnitExpression;
}

const COMMON_EXPRESSIONS: CommonUnitExpressions = {
	"m/s": {
		factors: [
			{ unitId: "m", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"km/h": {
		factors: [
			{ unitId: "km", exponent: 1 },
			{ unitId: "h", exponent: -1 },
		],
	},
	"[mi_i]/h": {
		factors: [
			{ unitId: "[mi_i]", exponent: 1 },
			{ unitId: "h", exponent: -1 },
		],
	},
	"[ft_i]/s": {
		factors: [
			{ unitId: "[ft_i]", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"m/s2": {
		factors: [
			{ unitId: "m", exponent: 1 },
			{ unitId: "s", exponent: -2 },
		],
	},
	"km/h2": {
		factors: [
			{ unitId: "km", exponent: 1 },
			{ unitId: "h", exponent: -2 },
		],
	},
	"[ft_i]/s2": {
		factors: [
			{ unitId: "[ft_i]", exponent: 1 },
			{ unitId: "s", exponent: -2 },
		],
	},
	m2: { factors: [{ unitId: "m", exponent: 2 }] },
	cm2: { factors: [{ unitId: "cm", exponent: 2 }] },
	"L/min": {
		factors: [
			{ unitId: "L", exponent: 1 },
			{ unitId: "min", exponent: -1 },
		],
	},
	"mL/s": {
		factors: [
			{ unitId: "mL", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"[gal_us]/min": {
		factors: [
			{ unitId: "[gal_us]", exponent: 1 },
			{ unitId: "min", exponent: -1 },
		],
	},
	"kg/s": {
		factors: [
			{ unitId: "kg", exponent: 1 },
			{ unitId: "s", exponent: -1 },
		],
	},
	"g/min": {
		factors: [
			{ unitId: "g", exponent: 1 },
			{ unitId: "min", exponent: -1 },
		],
	},
	"[lb_av]/h": {
		factors: [
			{ unitId: "[lb_av]", exponent: 1 },
			{ unitId: "h", exponent: -1 },
		],
	},
};

export function getCommonUnitExpression(
	symbol: keyof CommonUnitExpressions,
): UnitExpression {
	const expression = COMMON_EXPRESSIONS[symbol];
	if (!expression)
		throw new Error(`Unknown common unit expression '${symbol}'`);
	return { factors: expression.factors.map((factor) => ({ ...factor })) };
}
