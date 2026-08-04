export type WindowOverlayRoute = "help" | "preview" | "info" | "search" | "history";

export interface WindowOverlay {
	route: WindowOverlayRoute;
	payload?: unknown;
	originCellId?: string;
}

export type WindowOverlayAction =
	| "close"
	| "accept"
	| "edit"
	| "toggle"
	| "next"
	| "prev";
