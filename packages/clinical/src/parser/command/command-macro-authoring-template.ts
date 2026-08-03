export type CommandMacroTemplatePart =
	| { kind: "literal"; text: string }
	| { kind: "slot"; slotId: string; occurrence: number; displayText?: string };

export interface CommandMacroAuthoringTemplate {
	version: 1;
	parts: CommandMacroTemplatePart[];
}

export interface MacroSlotState {
	slotId: string;
	occurrence: number;
	status: "empty" | "partial" | "assigned" | "invalid";
	rawText: string;
	start: number;
	end: number;
}

export interface MacroAuthoringRender {
	text: string;
	slots: MacroSlotState[];
}

export function renderCommandMacroTemplate(
	template: CommandMacroAuthoringTemplate,
	values: ReadonlyMap<string, string> = new Map(),
): MacroAuthoringRender {
	let offset = 0;
	const slots: MacroSlotState[] = [];
	const chunks: string[] = [];
	for (const part of template.parts) {
		if (part.kind === "literal") {
			chunks.push(part.text);
			offset += part.text.length;
			continue;
		}
		const key = `${part.slotId}:${part.occurrence}`;
		const value = values.get(key) ?? "";
		const display = value || part.displayText || `<${part.slotId}>`;
		const start = offset;
		chunks.push(display);
		offset += display.length;
		slots.push({
			slotId: part.slotId,
			occurrence: part.occurrence,
			status: value ? "assigned" : "empty",
			rawText: value,
			start,
			end: offset,
		});
	}
	return { text: chunks.join(""), slots };
}

export function slotKey(slotId: string, occurrence = 0): string {
	return `${slotId}:${occurrence}`;
}

export function nextEmptyMacroSlot(
	slots: readonly MacroSlotState[],
	from = -1,
): MacroSlotState | undefined {
	return slots.slice(from + 1).find((slot) => slot.status === "empty" || slot.status === "partial")
		?? slots.find((slot) => slot.status === "empty" || slot.status === "partial");
}

export interface MacroSlotAssignment {
	values: Map<string, string>;
	rendered: MacroAuthoringRender;
	activeSlot?: MacroSlotState;
}

export function assignMacroSlot(
	template: CommandMacroAuthoringTemplate,
	values: ReadonlyMap<string, string>,
	slot: Pick<MacroSlotState, "slotId" | "occurrence">,
	value: string,
): MacroSlotAssignment {
	const nextValues = new Map(values);
	nextValues.set(slotKey(slot.slotId, slot.occurrence), value);
	const rendered = renderCommandMacroTemplate(template, nextValues);
	const assignedIndex = rendered.slots.findIndex((candidate) => candidate.slotId === slot.slotId && candidate.occurrence === slot.occurrence);
	return { values: nextValues, rendered, activeSlot: nextEmptyMacroSlot(rendered.slots, assignedIndex) };
}

export function isStructuredMacroSlot(value: unknown): value is Extract<CommandMacroTemplatePart, { kind: "slot" }> {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Record<string, unknown>;
	return candidate.kind === "slot" && typeof candidate.slotId === "string" && Number.isInteger(candidate.occurrence) && (candidate.occurrence as number) >= 0;
}
