/**
 * Declarative extension UI contribution schemas and polymorphic view provider contracts.
 */

export interface ViewContainerContribution {
	readonly id: string;
	readonly title: string;
	readonly icon: string;
	readonly altKey?: string;
	readonly order?: number;
	readonly region?: WorkspaceRegionId;
}

export type WorkspaceRegionId = "activity" | "inspector";
export type WorkspaceDock = "start" | "end";

export type WorkspaceContextKey =
	| "activeTabId"
	| "activeExtensionId"
	| "selectedResourceType"
	| "selectedResourceId"
	| "focusedPane"
	| "hasDiagnostics";

export type ContextExpression =
	| { readonly key: WorkspaceContextKey; readonly equals: string | boolean }
	| { readonly allOf: readonly ContextExpression[] }
	| { readonly anyOf: readonly ContextExpression[] }
	| { readonly not: ContextExpression };

export interface WorkspaceContext {
	readonly activeTabId: string;
	readonly activeExtensionId?: string;
	readonly selectedResourceType?: string;
	readonly selectedResourceId?: string;
	readonly focusedPane: string;
	readonly hasDiagnostics: boolean;
}

export interface ViewContribution {
	readonly id: string;
	readonly name: string;
	readonly containerId: string;
	readonly defaultExpanded?: boolean;
	readonly order?: number;
	readonly region?: WorkspaceRegionId;
	readonly priority?: number;
	readonly when?: ContextExpression;
}

export interface WorkspaceTabContribution {
	readonly id: string;
	readonly label: string;
	readonly order?: number;
	readonly defaultVisible?: boolean;
	readonly icon?: string;
}

export interface CommandContribution {
	readonly command: string;
	readonly title: string;
	readonly category?: string;
	readonly keybinding?: string;
	readonly when?: string;
}

export interface LocalizationContribution {
	readonly languageId: string;
	readonly translations: readonly {
		readonly id: string;
		readonly path: string;
	}[];
}

export interface MacroExtensionUIContributions {
	readonly viewsContainers?: {
		readonly activitybar?: readonly ViewContainerContribution[];
	};
	readonly views?: Readonly<Record<string, readonly ViewContribution[]>>;
	readonly workspaceTabs?: readonly WorkspaceTabContribution[];
	readonly commands?: readonly CommandContribution[];
	readonly localizations?: readonly LocalizationContribution[];
}

export interface ExtensionViewRenderContext<TState = unknown> {
	readonly viewId: string;
	readonly isFocused: boolean;
	readonly width?: number;
	readonly height?: number;
	readonly state?: TState;
	onEmitAction?(actionId: string, payload?: unknown): void;
}

export interface ExtensionTabRenderContext<TState = unknown> {
	readonly tabId: string;
	readonly isFocused: boolean;
	readonly state?: TState;
	onEmitAction?(actionId: string, payload?: unknown): void;
}

export interface ExtensionViewProvider<
	TRenderResult = unknown,
	TState = unknown,
> extends ExtensionInteractionProvider {
	render(context: ExtensionViewRenderContext<TState>): TRenderResult;
}

export interface ExtensionTabProvider<
	TRenderResult = unknown,
	TState = unknown,
> extends ExtensionInteractionProvider {
	render(context: ExtensionTabRenderContext<TState>): TRenderResult;
}

export interface CommandHandler {
	execute(...args: unknown[]): Promise<unknown> | unknown;
}

export interface WorkspaceInputEvent {
	readonly type: "key" | "pointer" | "wheel";
	readonly key?: string;
	readonly input?: string;
	readonly ctrl?: boolean;
	readonly meta?: boolean;
	readonly shift?: boolean;
	readonly x?: number;
	readonly y?: number;
	readonly delta?: number;
}

export type WorkspaceInputResult = "handled" | "ignored";

export interface ExtensionInteraction {
	readonly id: string;
	readonly role: "button" | "select" | "checkbox" | "text" | "diagram" | "menu";
	readonly label: string;
	readonly focusable?: boolean;
	readonly value?: unknown;
	readonly actions?: readonly string[];
}

export interface ExtensionInteractionContext {
	readonly scopeId: string;
	readonly focusedInteractionId?: string;
	readonly emitAction: (actionId: string, payload?: unknown) => void;
}

export interface ExtensionInteractionProvider {
	getInteractionModel?(
		context: ExtensionInteractionContext,
	): readonly ExtensionInteraction[];
	handleInput?(
		event: WorkspaceInputEvent,
		context: ExtensionInteractionContext,
	): Promise<WorkspaceInputResult> | WorkspaceInputResult;
}
