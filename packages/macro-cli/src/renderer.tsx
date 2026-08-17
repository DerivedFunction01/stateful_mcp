import type {
	ExtensionTabProvider,
	ExtensionTabRenderContext,
	ExtensionViewProvider,
	ExtensionViewRenderContext,
	MacroWorkspace,
} from "@stateful-mcp/macro";
import type { ReactElement, ReactNode } from "react";

export interface MacroCliRenderContext {
	readonly workspace: MacroWorkspace;
	readonly width: number;
	readonly height: number;
	readonly isFocused: boolean;
	readonly emitAction: (actionId: string, payload?: unknown) => void;
}

export type MacroCliViewProvider = ExtensionViewProvider<
	ReactElement | ReactNode | null
> & {
	render(
		context: MacroCliRenderContext & ExtensionViewRenderContext,
	): ReactElement | ReactNode | null;
	getContextualHints?(
		context: MacroCliRenderContext & ExtensionViewRenderContext,
	): readonly { key: string; label: string }[];
};

export type MacroCliTabProvider = ExtensionTabProvider<
	ReactElement | ReactNode | null
> & {
	render(
		context: MacroCliRenderContext & ExtensionTabRenderContext,
	): ReactElement | ReactNode | null;
};

export * from "./lab/story-contract";
export * from "./ui/index";
