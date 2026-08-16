import type { ReactElement } from "react";
import type {
	ExtensionTabRenderContext,
	ExtensionViewRenderContext,
	MacroWorkspace,
} from "@stateful-mcp/macro";

export interface MacroCliRenderContext {
	readonly workspace: MacroWorkspace;
	readonly width: number;
	readonly height: number;
	readonly isFocused: boolean;
	readonly emitAction: (actionId: string, payload?: unknown) => void;
}

export type MacroCliViewProvider = (
	context: MacroCliRenderContext & ExtensionViewRenderContext,
) => ReactElement | null;

export type MacroCliTabProvider = (
	context: MacroCliRenderContext & ExtensionTabRenderContext,
) => ReactElement | null;
