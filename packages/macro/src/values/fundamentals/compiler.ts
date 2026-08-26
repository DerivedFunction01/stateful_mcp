import { compileFundamentalVariant } from "./compile-variant";
import { diagnostic } from "./compiler-helpers";
import type {
	CompiledFundamentalVariant,
	FundamentalCompileResult,
	FundamentalDiagnostic,
	FundamentalGroup,
} from "./contracts";

/** Compiles configured extraction groups. This function only compiles syntax; terminal/domain parsers decide what captured slots mean. */
export function compileFundamentalGroups(
	groups: readonly FundamentalGroup[],
): FundamentalCompileResult {
	const diagnostics: FundamentalDiagnostic[] = [];
	const variants: CompiledFundamentalVariant[] = [];
	const groupIds = new Set<string>();
	for (const group of groups) {
		if (groupIds.has(group.id)) {
			diagnostics.push(
				diagnostic(
					"DUPLICATE_FUNDAMENTAL_GROUP",
					"values.fundamental.duplicateGroup",
					{ groupId: group.id },
				),
			);
			continue;
		}
		groupIds.add(group.id);
		const variantIds = new Set<string>();
		for (const variant of group.variants) {
			if (variantIds.has(variant.id)) {
				diagnostics.push(
					diagnostic(
						"DUPLICATE_FUNDAMENTAL_VARIANT",
						"values.fundamental.duplicateVariant",
						{ groupId: group.id, variantId: variant.id },
					),
				);
				continue;
			}
			variantIds.add(variant.id);
			const compiled = compileFundamentalVariant(
				group.id,
				variant,
				diagnostics,
			);
			if (compiled) variants.push(compiled);
		}
	}
	return {
		variants: Object.freeze(variants),
		diagnostics: Object.freeze(diagnostics),
	};
}
