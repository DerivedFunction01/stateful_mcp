import type { ReactElement } from "react";
import type {
	ExtensionTabProvider,
	ExtensionTabRenderContext,
	ExtensionViewProvider,
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

export type MacroCliViewProvider = ExtensionViewProvider<ReactElement | null> & {
	render(context: MacroCliRenderContext & ExtensionViewRenderContext): ReactElement | null;
};

export type MacroCliTabProvider = ExtensionTabProvider<ReactElement | null> & {
	render(context: MacroCliRenderContext & ExtensionTabRenderContext): ReactElement | null;
};
