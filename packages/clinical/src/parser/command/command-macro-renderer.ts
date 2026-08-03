export interface CommandMacroRenderValue {
	value: unknown;
	status?: "assigned" | "undefined" | "partial" | "ambiguous" | "invalid";
	confidence?: number;
	evidence?: unknown[];
}

export interface CommandMacroRenderContext {
	values: Readonly<Record<string, CommandMacroRenderValue | undefined>>;
	formatValue?: (argumentId: string, value: unknown, format: "canonical" | "display" | "short") => string;
	resolveTemplate?: (templateId: string, argumentsMap: Record<string, string>) => string;
}

export interface CommandMacroRenderPipeline {
	version: 1;
	steps: CommandMacroRenderStep[];
}

export type CommandMacroRenderStep =
	| { kind: "literal"; text: string }
	| { kind: "value"; argumentId: string; format?: "canonical" | "display" | "short"; label?: string }
	| { kind: "conditional"; when: CommandMacroRenderCondition; then: CommandMacroRenderStep[]; else?: CommandMacroRenderStep[] }
	| { kind: "join"; separator: string; steps: CommandMacroRenderStep[] }
	| { kind: "template"; templateId: string; arguments: Record<string, string> };

export type CommandMacroRenderCondition =
	| { kind: "assigned"; argumentId: string }
	| { kind: "equals"; argumentId: string; value: unknown }
	| { kind: "status"; argumentId: string; status: NonNullable<CommandMacroRenderValue["status"]> }
	| { kind: "confidenceAtLeast"; argumentId: string; threshold: number }
	| { kind: "all"; conditions: CommandMacroRenderCondition[] }
	| { kind: "any"; conditions: CommandMacroRenderCondition[] }
	| { kind: "not"; condition: CommandMacroRenderCondition };

function valueFor(context: CommandMacroRenderContext, argumentId: string): CommandMacroRenderValue | undefined {
	return context.values[argumentId];
}

function isAssigned(value: CommandMacroRenderValue | undefined): boolean {
	return Boolean(value && value.status !== "undefined" && value.status !== "invalid" && value.value !== undefined);
}

function equals(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
	try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
}

export function evaluateCommandMacroRenderCondition(
	condition: CommandMacroRenderCondition,
	context: CommandMacroRenderContext,
): boolean {
	switch (condition.kind) {
		case "assigned": return isAssigned(valueFor(context, condition.argumentId));
		case "equals": return equals(valueFor(context, condition.argumentId)?.value, condition.value);
		case "status": return valueFor(context, condition.argumentId)?.status === condition.status;
		case "confidenceAtLeast": return (valueFor(context, condition.argumentId)?.confidence ?? 0) >= condition.threshold;
		case "all": return condition.conditions.every((item) => evaluateCommandMacroRenderCondition(item, context));
		case "any": return condition.conditions.some((item) => evaluateCommandMacroRenderCondition(item, context));
		case "not": return !evaluateCommandMacroRenderCondition(condition.condition, context);
	}
}

function defaultFormat(value: unknown, format: "canonical" | "display" | "short"): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.map((item) => defaultFormat(item, format)).join(format === "short" ? ", " : ", ");
	if (typeof value === "object") {
		const record = value as Record<string, unknown>;
		if (format !== "canonical" && typeof record.display === "string") return record.display;
		if (record.value !== undefined && typeof record.unit === "string") return `${String(record.value)} ${record.unit}`;
		try { return JSON.stringify(value); } catch { return "[unrenderable]"; }
	}
	return String(value);
}

export function renderCommandMacroPipeline(
	pipeline: CommandMacroRenderPipeline,
	context: CommandMacroRenderContext,
): string {
	if (pipeline.version !== 1) throw new Error(`Unsupported command macro render pipeline version: ${pipeline.version}`);
	const renderSteps = (steps: CommandMacroRenderStep[]): string => steps.map((step) => {
		switch (step.kind) {
			case "literal": return step.text;
			case "value": {
				const entry = valueFor(context, step.argumentId);
				if (!entry || !isAssigned(entry)) return "";
				const assignedValue = entry.value;
				const format = step.format ?? "display";
				const rendered = context.formatValue?.(step.argumentId, assignedValue, format) ?? defaultFormat(assignedValue, format);
				return step.label ? `${step.label}${rendered}` : rendered;
			}
			case "conditional": return renderSteps(evaluateCommandMacroRenderCondition(step.when, context) ? step.then : (step.else ?? []));
			case "join": return step.steps.map((item) => renderSteps([item])).filter(Boolean).join(step.separator);
			case "template": {
				const argumentsMap = Object.fromEntries(Object.entries(step.arguments).map(([key, argumentId]) => {
					const entry = valueFor(context, argumentId);
					return [key, entry && isAssigned(entry) ? defaultFormat(entry.value, "display") : ""];
				}));
				return context.resolveTemplate?.(step.templateId, argumentsMap) ?? "";
			}
		}
	}).join("");
	return renderSteps(pipeline.steps);
}

export function renderCommandMacroTargets(
	pipeline: CommandMacroRenderPipeline,
	context: CommandMacroRenderContext,
): { text: string; status: "resolved" | "partial" | "ambiguous" | "invalid" } {
	const statuses = Object.values(context.values).map((entry) => entry?.status).filter(Boolean);
	const status = statuses.includes("invalid") ? "invalid" : statuses.includes("ambiguous") ? "ambiguous" : statuses.includes("partial") || statuses.includes("undefined") ? "partial" : "resolved";
	return { text: renderCommandMacroPipeline(pipeline, context), status };
}
