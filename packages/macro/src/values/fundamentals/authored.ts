import type { TemplateTokenSpec } from "../template-compiler";
import type { FundamentalGroup } from "./contracts";

/** Compiles one user-authored ordered token format into a reusable fundamental. */
export function createFundamentalFromAuthoredFormat<TToken extends string>(
	groupId: string,
	format: {
		readonly tokens: readonly TToken[];
		readonly separators: readonly string[];
	},
	tokenSpecs: Readonly<Record<TToken, TemplateTokenSpec>>,
): FundamentalGroup {
	const slots = format.tokens.map((token, index) => ({
		id: `${token}_${index}`,
		parserId: token,
		pattern: tokenSpecs[token]?.pattern,
		index,
	}));
	const connectors = slots.slice(1).map((_, index) => {
		const separator = format.separators[index + 1] ?? "";
		return [
			{
				id: `${groupId}-separator-${index}`,
				text: separator,
				boundary: "none" as const,
				caseSensitive: false,
			},
		];
	});
	return {
		id: groupId,
		variants: [
			{
				id: `${groupId}.authored`,
				prefix: format.separators[0]
					? [
							{
								id: `${groupId}-prefix`,
								text: format.separators[0]!,
								boundary: "none" as const,
							},
						]
					: undefined,
				slots: slots.map(({ id, parserId, pattern }) => ({
					id,
					parserId,
					pattern,
				})),
				connectors,
				postfix: format.separators[format.tokens.length]
					? [
							{
								id: `${groupId}-postfix`,
								text: format.separators[format.tokens.length]!,
								boundary: "none" as const,
							},
						]
					: undefined,
			},
		],
	};
}
