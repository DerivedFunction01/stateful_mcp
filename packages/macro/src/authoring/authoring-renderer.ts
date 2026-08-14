import type {
	MacroAuthoringSlot,
	MacroAuthoringTemplate,
} from "../contracts/matching";

export interface MacroAuthoringValue {
	argumentId: string;
	value?: string;
	status?: "bound" | "unresolved" | "invalid" | "missing";
}

export interface MacroAuthoringRender {
	text: string;
	missing: string[];
	invalid: string[];
}

export function renderMacroAuthoringTemplate(
	template: MacroAuthoringTemplate,
	values: readonly MacroAuthoringValue[],
): MacroAuthoringRender {
	const byArgument = new Map(values.map((value) => [value.argumentId, value]));
	const missing: string[] = [];
	const invalid: string[] = [];
	const renderSlot = (slot: MacroAuthoringSlot, fallbackName: string) => {
		const value = byArgument.get(slot.argumentId);
		if (value?.status === "invalid") {
			if (!invalid.includes(slot.argumentId)) invalid.push(slot.argumentId);
			return `<invalid: ${slot.displayText ?? fallbackName}>`;
		}
		if (!value?.value?.trim()) {
			if (!missing.includes(slot.argumentId)) missing.push(slot.argumentId);
			return `<blank: ${slot.displayText ?? fallbackName}>`;
		}
		return value.value;
	};

	if (template.templateText && template.slots) {
		const text = template.templateText.replace(
			/\{([a-zA-Z0-9_.-]+)\}/g,
			(_token, name: string) => {
				const slot = template.slots?.[name];
				return slot ? renderSlot(slot, name) : `<blank: ${name}>`;
			},
		);
		return { text, missing, invalid };
	}

	return {
		text: template.parts
			.map((part) =>
				part.kind === "literal"
					? part.text
					: renderSlot(part, part.displayText ?? part.argumentId),
			)
			.join(""),
		missing,
		invalid,
	};
}
