import type { DocumentAction } from "./document";

/** Named navigation owner; additional workspace contexts can be added without
 * changing the WindowContainer input contract. */
export type NavigationContext = "history" | "assessment" | (string & {});

export type NavigationDirection = "up" | "down";

export function navigationDirectionFor(
	action: DocumentAction,
): NavigationDirection | null {
	if (action.type !== "move") return null;
	return action.delta < 0 ? "up" : "down";
}
