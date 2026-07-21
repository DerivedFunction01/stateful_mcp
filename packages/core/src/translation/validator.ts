import type { TableTranslation } from "./types";

// Validates a full TableTranslation at load time.
// Throws Error on any violation — consistent with the fail-loud boot principle.
export function validateTableTranslation(
	tableName: string,
	translation: TableTranslation,
	engineOpFamilies: string[],
): void {
	const MAX_DEPTH = 20;

	for (const [publicProp, propTrans] of Object.entries(
		translation.properties,
	)) {
		if (!propTrans.transform) continue;
		const steps = propTrans.transform.pipeline;
		if (steps.length > MAX_DEPTH) {
			throw new Error(
				`Translation: pipeline too deep on "${tableName}.${publicProp}" (max ${MAX_DEPTH})`,
			);
		}

		const initNames = new Set<string>(); // row columns + constants (known before pipeline)
		const returnVarNames = new Set<string>(); // accumulated return_var names

		for (let i = 0; i < steps.length; i++) {
			const step = steps[i]!;

			// Check op-family capability
			const family = opFamily(step.op);
			if (!engineOpFamilies.includes(family)) {
				throw new Error(
					`Translation: op "${step.op}" (family: ${family}) used on "${tableName}.${publicProp}" ` +
						`but engine does not declare "${family}" in supported_op_families`,
				);
			}

			// Validate $var references point to prior steps only
			for (const arg of step.args) {
				if (arg !== null && typeof arg === "object" && "$var" in arg) {
					if (!returnVarNames.has(arg.$var)) {
						throw new Error(
							`Translation: $var "${arg.$var}" on step ${i} of "${tableName}.${publicProp}" ` +
								`references an undeclared or forward return_var`,
						);
					}
				}
			}

			// Check return_var doesn't collide with $init namespace
			if (step.return_var) {
				if (initNames.has(step.return_var)) {
					throw new Error(
						`Translation: return_var "${step.return_var}" on "${tableName}.${publicProp}" ` +
							`collides with an $init name`,
					);
				}
				returnVarNames.add(step.return_var);
			}
		}
	}
}

function opFamily(op: string): string {
	if (
		[
			"add",
			"sub",
			"mul",
			"div",
			"mod",
			"exp",
			"round",
			"ceil",
			"floor",
		].includes(op)
	)
		return "arithmetic";
	if (["lt", "leq", "eq", "neq", "geq", "gt"].includes(op)) return "comparison";
	if (["year", "month", "day", "quarter", "date_diff"].includes(op))
		return "date";
	if (["get", "json_parse"].includes(op)) return "nested_access";
	if (["to_string", "to_number"].includes(op)) return "conversion";
	if (
		[
			"starts_with",
			"ends_with",
			"str_contains",
			"substring",
			"trim",
			"lower",
			"upper",
			"concat",
		].includes(op)
	)
		return "string";
	if (["explode"].includes(op)) return "explode";
	return "unknown";
}
