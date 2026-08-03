import {
	evaluateTranslationCondition,
	executePipeline,
	formatTranslationValue,
	joinTranslationList,
	normalizeTranslationInput,
	resolveTranslationPath,
} from "@stateful-mcp/core";
import type {
	CommandTemplate,
	CommandTemplateSlot,
} from "../../store/reference/command-templates/interfaces";

export interface CommandMacroRenderValue {
	value: unknown;
	status?: "assigned" | "undefined" | "partial" | "ambiguous" | "invalid";
	confidence?: number;
	evidence?: unknown[];
}

export interface CommandMacroRenderContext {
	values?: Readonly<Record<string, CommandMacroRenderValue | undefined>>;
	data?: Readonly<Record<string, unknown>>;
	children?: Readonly<Record<string, CommandMacroRenderChild[]>>;
	formatValue?: (sourcePath: string, value: unknown, format: string) => string;
	resolveTemplate?: (templateId: string) => CommandTemplate | undefined;
}

export interface CommandMacroRenderChild {
	text?: string;
	status: "resolved" | "partial" | "ambiguous" | "invalid";
	values?: Readonly<Record<string, CommandMacroRenderValue | undefined>>;
}

export interface CommandMacroRenderResult {
	text: string;
	status: "resolved" | "partial" | "ambiguous" | "invalid";
	diagnostics: string[];
}

function statusFromValues(
	context: CommandMacroRenderContext,
): CommandMacroRenderResult["status"] {
	const statuses = [
		...Object.values(context.values ?? {}).map((entry) => entry?.status),
		...Object.values(context.children ?? {}).flatMap((children) =>
			children.map((child) => child.status),
		),
	].filter(Boolean);
	if (statuses.includes("invalid")) return "invalid";
	if (statuses.includes("ambiguous")) return "ambiguous";
	if (statuses.includes("partial") || statuses.includes("undefined"))
		return "partial";
	return "resolved";
}

function renderSlot(
	slot: CommandTemplateSlot,
	context: CommandMacroRenderContext,
	templates: ReadonlyMap<string, CommandTemplate>,
	visited: Set<string>,
	diagnostics: string[],
): string {
	const source = resolveTranslationPath(
		context.data ?? context,
		slot.sourcePath,
	);
	if (slot.conditions) {
		try {
			if (!evaluateTranslationCondition(slot.conditions.pipeline, source))
				return slot.fallback ?? "";
		} catch (error) {
			diagnostics.push(`condition ${slot.sourcePath}: ${String(error)}`);
			return slot.fallback ?? "";
		}
	}
	if (source === undefined || source === null) return slot.fallback ?? "";
	if (slot.child) {
		const children = Array.isArray(source)
			? (source as CommandMacroRenderChild[])
			: [source as CommandMacroRenderChild];
		const fragments = children.map((child) => child.text ?? "");
		return joinTranslationList(fragments, slot.listOptions);
	}
	const delegateId = (() => {
		for (const delegate of slot.conditionalDelegates ?? []) {
			try {
				if (evaluateTranslationCondition(delegate.conditions.pipeline, source))
					return delegate.delegateTemplateId;
			} catch (error) {
				diagnostics.push(
					`delegate condition ${slot.sourcePath}: ${String(error)}`,
				);
			}
		}
		return slot.defaultDelegateTemplateId;
	})();
	let rendered: string;
	if (delegateId) {
		const template =
			templates.get(delegateId) ?? context.resolveTemplate?.(delegateId);
		if (!template) {
			diagnostics.push(`missing render template '${delegateId}'`);
			return slot.fallback ?? "";
		}
		if (visited.has(template.templateId)) {
			diagnostics.push(
				`circular render template dependency at '${template.templateId}'`,
			);
			return slot.fallback ?? "";
		}
		const values = Array.isArray(source)
			? source.map(
					(item) =>
						renderCommandTemplate(
							template,
							{ ...context, data: normalizeTranslationInput(item) },
							templates,
							new Set([...visited, template.templateId]),
							diagnostics,
						).text,
				)
			: [
					renderCommandTemplate(
						template,
						{ ...context, data: normalizeTranslationInput(source) },
						templates,
						new Set([...visited, template.templateId]),
						diagnostics,
					).text,
				];
		rendered = joinTranslationList(values, slot.listOptions);
	} else if (Array.isArray(source)) {
		rendered = joinTranslationList(
			source.map((item) => formatTranslationValue(item, slot.format)),
			slot.listOptions,
		);
	} else {
		rendered =
			context.formatValue?.(
				slot.sourcePath,
				source,
				slot.format ?? "display",
			) ?? formatTranslationValue(source, slot.format);
	}
	if (slot.transform) {
		try {
			rendered = String(
				executePipeline(
					slot.transform.pipeline,
					normalizeTranslationInput(source),
					{},
				),
			);
		} catch (error) {
			diagnostics.push(`transform ${slot.sourcePath}: ${String(error)}`);
		}
	}
	return rendered || slot.fallback || "";
}

export function renderCommandTemplate(
	template: CommandTemplate,
	context: CommandMacroRenderContext,
	templates: ReadonlyMap<string, CommandTemplate> = new Map(),
	visited: Set<string> = new Set([template.templateId]),
	diagnostics: string[] = [],
): CommandMacroRenderResult {
	let text = template.templateText;
	for (const token of text.match(/\{([a-zA-Z0-9_.$-]+)\}/g) ?? []) {
		const slot = template.slots[token.slice(1, -1)];
		const replacement = slot
			? renderSlot(slot, context, templates, visited, diagnostics)
			: "";
		text = text.replace(token, replacement);
	}
	return {
		text,
		status: diagnostics.length ? "invalid" : statusFromValues(context),
		diagnostics,
	};
}

export function renderCommandMacroTargets(
	template: CommandTemplate,
	context: CommandMacroRenderContext,
	templates?: ReadonlyMap<string, CommandTemplate>,
): CommandMacroRenderResult {
	return renderCommandTemplate(template, context, templates);
}
