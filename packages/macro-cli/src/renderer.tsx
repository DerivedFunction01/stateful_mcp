import type { ReactElement, ReactNode } from "react";
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

export type MacroCliViewProvider = ExtensionViewProvider<ReactElement | ReactNode | null> & {
	render(context: MacroCliRenderContext & ExtensionViewRenderContext): ReactElement | ReactNode | null;
};

export type MacroCliTabProvider = ExtensionTabProvider<ReactElement | ReactNode | null> & {
	render(context: MacroCliRenderContext & ExtensionTabRenderContext): ReactElement | ReactNode | null;
};

export * from "./ui/index";
export * from "./lab/story-contract";
