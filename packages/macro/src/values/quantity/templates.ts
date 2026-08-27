import { createFundamentalFromAuthoredFormat } from "../fundamentals";
import { buildNumericPatternString } from "../numeric";
import { escapeRegex } from "../regex";
import type { TemplateTokenSpec } from "../template-compiler";
import {
	parseFormatTemplate,
	QUANTITY_TOKENS,
	type QuantityToken,
} from "../token-spec";
import type {
	AuthoredQuantityTemplateCompilation,
	QuantityGrammarConfig,
} from "./contracts";

const quantityTemplateConsumer: Readonly<Record<QuantityToken, string>> = {
	NUM: "quantity-amount",
	NUM_LOW: "quantity-amount",
	NUM_HIGH: "quantity-amount",
	UNIT: "quantity-unit",
	PKG_CLASSIFIER: "quantity-packaging",
	FILLER: "quantity-filler",
	OP_PREFIX: "operator",
	OP_POSTFIX: "operator",
	OP_SUFFIX: "operator",
	STAT_QUALIFIER: "statistic",
	CONCEPT: "concept",
};

export function compileAuthoredQuantityTemplates(
	config: QuantityGrammarConfig,
): AuthoredQuantityTemplateCompilation {
	const fundamentals =
		[] as AuthoredQuantityTemplateCompilation["fundamentals"][number][];
	const recipes =
		[] as AuthoredQuantityTemplateCompilation["recipes"][number][];
	const aliases = Object.entries(config.unitAliases ?? {}).flatMap(
		([unit, values]) => [unit, ...values],
	);
	const packaging = Object.entries(config.packagingClassifiers ?? {}).flatMap(
		([unit, values]) => [unit, ...(Array.isArray(values) ? values : [])],
	);
	const tokenSpecs: Record<QuantityToken, TemplateTokenSpec> = {
		NUM: { pattern: buildNumericPatternString({ ...config }) },
		NUM_LOW: { pattern: buildNumericPatternString({ ...config }) },
		NUM_HIGH: { pattern: buildNumericPatternString({ ...config }) },
		UNIT: {
			pattern: aliases.length
				? `(?:${aliases.map(escapeRegex).join("|")})`
				: "[^\\s]+",
		},
		PKG_CLASSIFIER: { pattern: `(?:${packaging.map(escapeRegex).join("|")})` },
		FILLER: {
			pattern: `(?:${(config.fillerConnectors ?? []).map(escapeRegex).join("|")})`,
		},
		OP_PREFIX: { pattern: ".+?" },
		OP_POSTFIX: { pattern: ".+?" },
		OP_SUFFIX: { pattern: ".+?" },
		STAT_QUALIFIER: { pattern: ".+?" },
		CONCEPT: { pattern: "[\\p{L}\\p{N}][\\p{L}\\p{N} _-]*" },
	};
	for (const [index, template] of (config.templates ?? []).entries()) {
		const format =
			typeof template === "string"
				? parseFormatTemplate(template, QUANTITY_TOKENS)
				: template;
		if (format.tokens.length === 0) continue;
		const groupId = `quantity.template.${format.id ?? index}`;
		fundamentals.push(
			createFundamentalFromAuthoredFormat(groupId, format, tokenSpecs),
		);
		recipes.push({
			id: groupId,
			root: {
				kind: "fundamental",
				groupId,
				children: format.tokens.map((token) => ({
					kind: "terminal" as const,
					consumerId: quantityTemplateConsumer[token],
				})),
			},
			outputBuilderId:
				format.tokens.filter((token) => token.startsWith("NUM")).length > 1
					? "quantity.compound"
					: "quantity.template",
		});
	}
	if (config.rangeComponents?.length) {
		const groupId = "quantity.range";
		fundamentals.push({
			id: groupId,
			variants: config.rangeComponents.map((component) => ({
				id: component.id,
				prefix: component.prefix,
				slots: [
					{ id: "start", parserId: "quantity", pattern: ".+?" },
					{ id: "end", parserId: "quantity", pattern: ".+?" },
				],
				connectors: [component.connector],
				postfix: component.suffix,
			})),
		});
		recipes.push({
			id: groupId,
			root: {
				kind: "fundamental",
				groupId,
				children: [
					{ kind: "terminal", consumerId: "quantity" },
					{ kind: "terminal", consumerId: "quantity" },
				],
			},
			outputBuilderId: "quantity.range",
		});
	}
	return { fundamentals, recipes };
}
