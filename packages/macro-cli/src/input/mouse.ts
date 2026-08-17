import type { MouseEvent } from "@opentui/core";
import type { WorkspaceInputEvent } from "@stateful-mcp/macro";

export type NormalizedMouseEvent = WorkspaceInputEvent & {
	readonly type: "pointer" | "wheel";
	readonly x: number;
	readonly y: number;
};

export function normalizeOpenTuiMouseEvent(
	event: MouseEvent,
): NormalizedMouseEvent {
	const isWheel = event.type === "scroll";
	const button =
		event.button === 0
			? "left"
			: event.button === 1
				? "middle"
				: event.button === 2
					? "right"
					: undefined;
	return {
		type: isWheel ? "wheel" : "pointer",
		action: isWheel
			? undefined
			: event.type === "down"
				? "press"
				: event.type === "up" ||
						event.type === "drag-end" ||
						event.type === "drop"
					? "release"
					: event.type === "drag" || event.type === "move"
						? event.type
						: undefined,
		button,
		x: event.x,
		y: event.y,
		delta:
			event.scroll?.direction === "up" || event.scroll?.direction === "left"
				? -Math.abs(event.scroll.delta)
				: event.scroll?.delta,
		shift: event.modifiers.shift,
		ctrl: event.modifiers.ctrl,
		meta: event.modifiers.alt,
	};
}
