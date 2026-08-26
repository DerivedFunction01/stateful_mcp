import type { OperatorConfig, OperatorKind, OperatorPosition } from "./types";

/**
 * Formats a canonical OperatorKind back to a preferred string representation.
 */
export function formatOperator(
	operator: OperatorKind,
	position: OperatorPosition = "prefix",
	config: OperatorConfig = {},
): string {
	const aliases =
		position === "prefix"
			? (config.prefixAliases ?? config.operators)
			: config.postfixAliases;
	const configuredAlias = aliases?.[operator]?.[0];
	if (configuredAlias) {
		return configuredAlias;
	}

	// Universal language-neutral mathematical symbols
	switch (operator) {
		case "greater_equal":
			return ">=";
		case "less_equal":
			return "<=";
		case "greater":
			return ">";
		case "less":
			return "<";
		case "not_equal":
			return "!=";
		case "approximate":
			return "~";
		case "tolerance":
			return "±";
		case "equal":
			return "=";
	}
}
