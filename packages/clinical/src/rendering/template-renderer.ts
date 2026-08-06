import {
	evaluateTranslationCondition,
	executePipeline,
	formatTranslationValue,
	joinTranslationList,
	normalizeTranslationInput,
	resolveTranslationPath,
} from "@stateful-mcp/core";
import type { ClinicalDateRange } from "../schemas/schemas-interface/time";
import { ProseRenderLookupCache } from "./prose-render-context";
import type {
	ClinicalProseTemplate,
	OutputProseSlot,
	ProseRenderContext,
	SlotCondition,
} from "./template-types";

export class TemplateRenderer {
	static async renderTemplateAsync(
		template: ClinicalProseTemplate,
		value: unknown,
		templates: readonly ClinicalProseTemplate[],
		context: ProseRenderContext = {},
		visited = new Set<string>(),
		slotOverrides?: Record<string, string>,
		cache = new ProseRenderLookupCache(context),
	): Promise<string> {
		if (visited.has(template.templateId))
			throw new Error(
				`Circular template dependency detected at '${template.templateId}'`,
			);
		const nextVisited = new Set(visited).add(template.templateId);
		let output = template.templateText;
		for (const token of TemplateRenderer.extractTokens(output)) {
			const slot = template.slots[token];
			const replacement = slot
				? await TemplateRenderer.renderSlotAsync(
						slot,
						value,
						templates,
						nextVisited,
						context,
						slotOverrides,
						template,
						cache,
					)
				: "";
			output = output.replace(`{${token}}`, replacement);
		}
		return output;
	}

	static async renderObjectAsync(
		value: Record<string, unknown>,
		templates: readonly ClinicalProseTemplate[],
		targetSchema: string,
		context: ProseRenderContext = {},
		options: {
			rootTemplateId?: string;
			slotOverrides?: Record<string, string>;
			lookupCache?: ProseRenderLookupCache;
		} = {},
	): Promise<string | null> {
		const candidates = templates
			.filter((template) => template.targetSchema === targetSchema)
			.sort(
				(left, right) =>
					Number(Boolean(right.targetConceptId)) -
					Number(Boolean(left.targetConceptId)),
			);
		const template = options.rootTemplateId
			? templates.find(
					(candidate) => candidate.templateId === options.rootTemplateId,
				)
			: candidates[0];
		return template
			? TemplateRenderer.renderTemplateAsync(
					template,
					value,
					templates,
					context,
					new Set(),
					options.slotOverrides,
					options.lookupCache,
				)
			: null;
	}

	static renderTemplate(
		template: ClinicalProseTemplate,
		context: unknown,
		templates: readonly ClinicalProseTemplate[],
		visited = new Set<string>(),
		slotOverrides?: Record<string, string>,
	): string {
		if (visited.has(template.templateId))
			throw new Error(
				`Circular template dependency detected at '${template.templateId}'`,
			);
		const nextVisited = new Set(visited).add(template.templateId);
		let output = template.templateText;
		for (const token of TemplateRenderer.extractTokens(output)) {
			const slot = template.slots[token];
			const replacement = slot
				? TemplateRenderer.renderSlot(
						slot,
						context,
						templates,
						nextVisited,
						slotOverrides,
						template,
					)
				: "";
			output = output.replace(`{${token}}`, replacement);
		}
		return output;
	}

	static renderObject(
		value: Record<string, unknown>,
		templates: readonly ClinicalProseTemplate[],
		targetSchema: string,
		options: {
			rootTemplateId?: string;
			slotOverrides?: Record<string, string>;
		} = {},
	): string | null {
		const candidates = templates
			.filter((template) => template.targetSchema === targetSchema)
			.sort(
				(left, right) =>
					Number(Boolean(right.targetConceptId)) -
					Number(Boolean(left.targetConceptId)),
			);
		const template = options.rootTemplateId
			? templates.find(
					(candidate) => candidate.templateId === options.rootTemplateId,
				)
			: candidates[0];
		return template
			? TemplateRenderer.renderTemplate(
					template,
					value,
					templates,
					new Set(),
					options.slotOverrides,
				)
			: null;
	}

	private static renderSlot(
		slot: OutputProseSlot,
		context: unknown,
		templates: readonly ClinicalProseTemplate[],
		visited: Set<string>,
		slotOverrides: Record<string, string> | undefined,
		owner: ClinicalProseTemplate,
	): string {
		const value = resolveTranslationPath(context, slot.sourcePath);
		if (
			value === undefined ||
			value === null ||
			(slot.conditions && !TemplateRenderer.condition(slot.conditions, context))
		)
			return slot.fallback ?? "";
		const slotKey =
			slot.contract?.slotKey ?? `${owner.templateId}.${slot.sourcePath}`;
		const delegateId =
			slotOverrides?.[slotKey] ??
			(slot.conditionalDelegates ?? []).find((delegate) =>
				TemplateRenderer.condition(delegate.conditions, value),
			)?.delegateTemplateId ??
			slot.defaultDelegateTemplateId;
		let rendered = delegateId
			? templates.find((template) => template.templateId === delegateId)
				? Array.isArray(value)
					? joinTranslationList(
							value.map((item) =>
								TemplateRenderer.renderTemplate(
									templates.find(
										(template) => template.templateId === delegateId,
									)!,
									item,
									templates,
									visited,
									slotOverrides,
								),
							),
							slot.listOptions,
						)
					: TemplateRenderer.renderTemplate(
							templates.find((template) => template.templateId === delegateId)!,
							value,
							templates,
							visited,
							slotOverrides,
						)
				: (slot.fallback ?? "")
			: Array.isArray(value)
				? joinTranslationList(
						value.map((item) => formatTranslationValue(item, slot.format)),
						slot.listOptions,
					)
				: formatTranslationValue(value, slot.format);
		if (slot.transform?.pipeline)
			rendered = String(
				executePipeline(
					slot.transform.pipeline,
					normalizeTranslationInput(value),
					{},
				) ?? "",
			);
		return rendered;
	}

	private static async renderSlotAsync(
		slot: OutputProseSlot,
		valueContext: unknown,
		templates: readonly ClinicalProseTemplate[],
		visited: Set<string>,
		context: ProseRenderContext,
		slotOverrides: Record<string, string> | undefined,
		owner: ClinicalProseTemplate,
		cache: ProseRenderLookupCache,
	): Promise<string> {
		const value = slot.sourcePath.startsWith("$context.")
			? resolveTranslationPath(
					context.variables,
					slot.sourcePath.slice("$context.".length),
				)
			: resolveTranslationPath(valueContext, slot.sourcePath);
		if (value === undefined || value === null) return slot.fallback ?? "";
		const slotKey =
			slot.contract?.slotKey ?? `${owner.templateId}.${slot.sourcePath}`;
		const delegateId =
			slotOverrides?.[slotKey] ??
			(slot.conditionalDelegates ?? []).find((delegate) =>
				TemplateRenderer.condition(delegate.conditions, value),
			)?.delegateTemplateId ??
			slot.defaultDelegateTemplateId;
		const delegate = delegateId
			? templates.find((candidate) => candidate.templateId === delegateId)
			: undefined;
		if (delegate) {
			if (Array.isArray(value)) {
				const items = await Promise.all(
					value.map((item) =>
						TemplateRenderer.renderTemplateAsync(
							delegate,
							item,
							templates,
							context,
							visited,
							slotOverrides,
							cache,
						),
					),
				);
				return joinTranslationList(items, slot.listOptions);
			}
			return TemplateRenderer.renderTemplateAsync(
				delegate,
				value,
				templates,
				context,
				visited,
				slotOverrides,
				cache,
			);
		}
		return TemplateRenderer.formatContextValue(
			value,
			slot.valueSpec,
			context,
			cache,
			slot.format,
		);
	}

	private static async formatContextValue(
		value: unknown,
		spec: OutputProseSlot["valueSpec"],
		context: ProseRenderContext,
		cache: ProseRenderLookupCache,
		format?: string,
	): Promise<string> {
		if (!spec || spec.kind === "literal")
			return formatTranslationValue(value, format);
		if (
			spec.kind === "concept" ||
			spec.display === "dictionary" ||
			spec.display === "preferred"
		) {
			const conceptId =
				typeof value === "string"
					? value
					: (value as { conceptId?: string })?.conceptId;
			if (!conceptId || !context.dictionary)
				return spec.display === "code" ? (conceptId ?? "") : "";
			const concept = await cache.getConcept(conceptId);
			if (
				!concept ||
				(spec.allowedNamespaces &&
					!spec.allowedNamespaces.includes(concept.namespaceCode))
			)
				return "[unresolved concept]";
			return spec.display === "code" ? concept.standardCode : concept.display;
		}
		if (
			spec.kind === "measurement" &&
			context.formatMeasurement &&
			typeof value === "object" &&
			value
		) {
			const measurement = value as {
				value?: number;
				valueInBase?: number;
				unit?: string;
				anchor?: string;
			};
			if (
				typeof measurement.value === "number" &&
				spec.unit &&
				measurement.anchor
			)
				return context.formatMeasurement({
					value: measurement.value,
					fromUnit: measurement.unit,
					toUnit: spec.unit,
					anchor: measurement.anchor,
				});
		}
		if (
			spec.kind === "time" &&
			context.formatDateRange &&
			typeof value === "object" &&
			value
		) {
			return context.formatDateRange(value as ClinicalDateRange, {
				mode: spec.time?.mode ?? "auto",
				relativeLabels: spec.time?.relativeLabels ?? "never",
				dateFormat: spec.time?.dateFormat,
				timeZone: spec.time?.timeZone,
				locale: spec.time?.locale,
				relativeLabelMapId: spec.time?.relativeLabelMapId,
			});
		}
		if (spec.kind === "enum" && context.displayEnum)
			return context.displayEnum(value, {
				mapKey: spec.enumMapKey,
				locale: spec.locale,
			});
		if (spec.kind === "pronoun" && context.resolvePronoun)
			return context.resolvePronoun({
				gender: String(context.variables?.gender ?? ""),
			});
		return formatTranslationValue(value, format);
	}

	private static condition(
		condition: SlotCondition,
		context: unknown,
	): boolean {
		return evaluateTranslationCondition(condition.pipeline, context);
	}
	private static extractTokens(text: string): string[] {
		return [...text.matchAll(/\{([a-zA-Z0-9_.-]+)\}/g)].map(
			(match) => match[1]!,
		);
	}
}
