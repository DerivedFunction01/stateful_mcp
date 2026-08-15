import type { MacroExecutionAttempt } from "../../src/history/contracts";
import type { MacroOutputRenderer } from "../../src/rendering/contracts";

export function createListOutputRenderer(options: {
	id?: string;
	order?: number;
	label: (event: MacroExecutionAttempt) => string;
}): MacroOutputRenderer {
	return {
		id: options.id ?? "list",
		order: options.order,
		supports: () => true,
		render: (event, context) => ({
			json: {
				sequence: context.sequence,
				eventId: event.attemptId,
				macroId: event.macroId,
				outcome: event.outcome,
				label: options.label(event),
			},
		}),
	};
}

export function createNoteTextRenderer(options: {
	id?: string;
	order?: number;
	text: (event: MacroExecutionAttempt) => string | undefined;
	payload?: (event: MacroExecutionAttempt) => unknown;
}): MacroOutputRenderer {
	return {
		id: options.id ?? "note",
		order: options.order,
		supports: (event) => options.text(event) !== undefined,
		render: (event) => ({
			text: options.text(event),
			...(options.payload ? { json: options.payload(event) } : {}),
		}),
	};
}

export function createGroupedWorkspaceRenderer(options: {
	id?: string;
	order?: number;
	group: (
		event: MacroExecutionAttempt,
	) => { id: string; label?: string; order?: number } | undefined;
	item: (event: MacroExecutionAttempt) => {
		id: string;
		label?: string;
		order?: number;
	};
}): MacroOutputRenderer {
	return {
		id: options.id ?? "workspace",
		order: options.order,
		supports: (event) => options.group(event) !== undefined,
		render: (event) => {
			const group = options.group(event);
			if (!group) return undefined;
			return {
				json: {
					groups: [
						{
							...group,
							items: [options.item(event)],
						},
					],
				},
			};
		},
	};
}
