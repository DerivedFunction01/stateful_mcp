import type { OpName, PipelineStep } from "@stateful-mcp/core";
import type { CommandTemplate, CommandTemplateSlot } from "./interfaces";

const OPS = new Set<OpName>([
	"neg",
	"not",
	"add",
	"sub",
	"mul",
	"div",
	"mod",
	"exp",
	"lt",
	"leq",
	"eq",
	"neq",
	"geq",
	"gt",
	"in_set",
	"not_in_set",
	"and",
	"or",
	"year",
	"month",
	"day",
	"quarter",
	"date_diff",
	"get",
	"json_parse",
	"to_string",
	"to_number",
	"round",
	"ceil",
	"floor",
	"starts_with",
	"ends_with",
	"str_contains",
	"substring",
	"trim",
	"lower",
	"upper",
	"concat",
]);

function validatePipeline(
	steps: PipelineStep[],
	path: string,
	diagnostics: string[],
): void {
	if (steps.length > 20)
		diagnostics.push(`${path}: pipeline exceeds maximum depth of 20`);
	const variables = new Set<string>();
	for (const [index, step] of steps.entries()) {
		if (!OPS.has(step.op))
			diagnostics.push(
				`${path}[${index}].op: unsupported operation '${String(step.op)}'`,
			);
		for (const argument of step.args) {
			if (
				argument &&
				typeof argument === "object" &&
				"$var" in argument &&
				!variables.has(argument.$var)
			)
				diagnostics.push(
					`${path}[${index}]: variable '${argument.$var}' must refer to an earlier return_var`,
				);
		}
		if (step.return_var) variables.add(step.return_var);
	}
}

function validateSlot(
	slot: CommandTemplateSlot,
	path: string,
	diagnostics: string[],
): void {
	if (!slot.sourcePath.trim())
		diagnostics.push(`${path}.sourcePath: source path is required`);
	if (slot.conditions)
		validatePipeline(
			slot.conditions.pipeline,
			`${path}.conditions.pipeline`,
			diagnostics,
		);
	if (slot.transform)
		validatePipeline(
			slot.transform.pipeline,
			`${path}.transform.pipeline`,
			diagnostics,
		);
	for (const [index, delegate] of (slot.conditionalDelegates ?? []).entries()) {
		if (!delegate.delegateTemplateId.trim())
			diagnostics.push(
				`${path}.conditionalDelegates[${index}].delegateTemplateId: template ID is required`,
			);
		validatePipeline(
			delegate.conditions.pipeline,
			`${path}.conditionalDelegates[${index}].conditions.pipeline`,
			diagnostics,
		);
	}
	if (
		slot.defaultDelegateTemplateId !== undefined &&
		!slot.defaultDelegateTemplateId.trim()
	)
		diagnostics.push(
			`${path}.defaultDelegateTemplateId: template ID cannot be empty`,
		);
	if (slot.listOptions?.delimiter === "")
		diagnostics.push(
			`${path}.listOptions.delimiter: delimiter cannot be empty`,
		);
	if (slot.child && !slot.child.childMacroName.trim())
		diagnostics.push(
			`${path}.child.childMacroName: child macro name is required`,
		);
}

export function validateCommandTemplate(template: CommandTemplate): string[] {
	const diagnostics: string[] = [];
	if (!template.templateId.trim())
		diagnostics.push("templateId: template ID is required");
	if (!template.templateText)
		diagnostics.push("templateText: template text is required");
	for (const token of template.templateText.match(/\{([a-zA-Z0-9_.$-]+)\}/g) ??
		[]) {
		const slotId = token.slice(1, -1);
		if (!template.slots[slotId])
			diagnostics.push(
				`slots.${slotId}: template token has no slot definition`,
			);
	}
	for (const [slotId, slot] of Object.entries(template.slots))
		validateSlot(slot, `slots.${slotId}`, diagnostics);
	return diagnostics;
}

export function assertValidCommandTemplate(template: CommandTemplate): void {
	const diagnostics = validateCommandTemplate(template);
	if (diagnostics.length)
		throw new Error(`Invalid command template: ${diagnostics.join("; ")}`);
}
