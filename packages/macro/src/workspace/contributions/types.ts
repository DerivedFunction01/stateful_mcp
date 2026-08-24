/**
 * Declarative extension UI contribution schemas and polymorphic view provider contracts.
 */

import type { EditorMode } from "../editor/editor-kernel";
import type { I18nKey } from "../i18n/locales/i18n-keys";

export interface ContextualKeyHint {
	readonly key: string;
	readonly label?: string;
	readonly i18nKey?: string;
	readonly mode?: EditorMode;
	readonly action?: string;
}

export interface SurfaceKeybinding {
	readonly key: string;
	readonly mode: EditorMode;
	readonly action: string;
	readonly label: string;
	readonly when?: string;
}

export interface ViewContainerContribution {
	readonly id: I18nKey | (string & {});
	readonly titleI18nKey?: I18nKey;
	readonly icon?: string;
	readonly altKey?: string;
	readonly order?: number;
	readonly region?: WorkspaceRegionId;
	readonly contextualHints?: readonly ContextualKeyHint[];
	readonly keybindings?: readonly SurfaceKeybinding[];
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
	readonly keybindings?: readonly SurfaceKeybinding[];
}

export interface WorkspaceTabContribution {
	readonly id: string;
	readonly label: string;
	readonly order?: number;
	readonly defaultVisible?: boolean;
	readonly icon?: string;
	readonly keybindings?: readonly SurfaceKeybinding[];
}

export interface CommandContribution {
	readonly command: string;
	readonly titleI18nKey?: string;
	readonly categoryI18nKey?: string;
	readonly keybinding?: string;
	readonly when?: string;
	readonly verb?: string;
	readonly aliases?: readonly string[];
	readonly description?: string;
	readonly args?: readonly WorkspaceCommandArgument[];
}

export interface WorkspaceCommandArgument {
	readonly name: string;
	readonly required?: boolean;
	readonly description?: string;
	readonly completions?: readonly string[];
	readonly type?: "enum" | "identifier" | "expression" | "text";
}

export interface WorkspacePersistenceParticipant {
	readonly id: string;
	readonly scope: "tab" | "workspace";
	readonly tabId?: string;
	readonly isDirty?: () => boolean;
	save(request: WorkspaceSaveRequest): Promise<WorkspaceSaveResult>;
}

export interface WorkspaceSaveRequest {
	readonly reason: "explicit" | "quit" | "close" | "shutdown";
	readonly scope: "active" | "all";
	readonly signal?: AbortSignal;
}

export type WorkspaceSaveResult =
	| { readonly status: "saved"; readonly message?: string }
	| { readonly status: "unchanged" }
	| { readonly status: "skipped"; readonly reason?: string }
	| { readonly status: "needsConfirmation"; readonly message: string }
	| {
			readonly status: "failed";
			readonly message: string;
			readonly error?: unknown;
	  };

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
	readonly settings?: readonly ExtensionSettingsContribution[];
	/** Project-shared configuration is opt-in; ordinary extension settings remain user/workspace scoped. */
	readonly projectSettings?: readonly ProjectSettingsContribution[];
	/** Project resource kinds that may be projected into the host resource explorer. */
	readonly resourceProviders?: readonly ResourceProviderContribution[];
}

export interface ResourceProviderContribution {
	readonly id: string;
	readonly kind: string;
	readonly title: string;
	readonly icon?: string;
	readonly order?: number;
	readonly scopes?: readonly (
		| "project"
		| "global"
		| "content"
		| "cache"
		| "external"
	)[];
	readonly capabilities?: readonly (
		| "open"
		| "inspect"
		| "refresh"
		| "download"
		| "save"
		| "delete"
		| "invoke"
	)[];
}

export interface ResourceProvider {
	listProjectResources?():
		| Promise<
				readonly {
					readonly resourceId: string;
					readonly label: string;
					readonly metadata?: Readonly<Record<string, unknown>>;
				}[]
		  >
		| readonly {
				readonly resourceId: string;
				readonly label: string;
				readonly metadata?: Readonly<Record<string, unknown>>;
		  }[];
	executeAction?(
		action: string,
		resourceId: string,
		args: readonly unknown[],
	): Promise<unknown> | unknown;
}

export interface ProjectSettingsContribution {
	readonly namespace: string;
	readonly title: string;
	readonly description?: string;
	readonly schema: readonly import("../config/settings-service").SettingsSchemaEntry[];
	readonly defaults?: Readonly<Record<string, unknown>>;
	readonly impact?: "refresh" | "workspaceReload" | "migrationRequired";
	readonly sensitivePaths?: readonly (readonly string[])[];
}

export interface ExtensionSettingsContribution {
	readonly namespace: string;
	readonly title: string;
	readonly description?: string;
	readonly category?: string;
	readonly icon?: string;
	readonly order?: number;
	readonly schema: readonly import("../config/settings-service").SettingsSchemaEntry[];
	readonly defaults?: Readonly<Record<string, unknown>>;
	readonly localizationKeys?: readonly string[];
	readonly customWidgetProviders?: Readonly<
		Record<string, ExtensionSettingsWidgetProvider>
	>;
	readonly restartRequired?: boolean;
}

export interface ExtensionSettingsWidgetContext<T = unknown> {
	readonly schema: import("../config/settings-service").SettingsSchemaEntry;
	readonly value: T;
	readonly effectiveValue: T;
	readonly isFocused: boolean;
	readonly width: number;
	readonly theme: unknown;
	readonly onChange: (value: T) => void;
	readonly onReset: () => void;
}

export type ExtensionSettingsWidgetProvider<
	TRenderResult = unknown,
	T = unknown,
> = (context: ExtensionSettingsWidgetContext<T>) => TRenderResult;

export interface ExtensionViewRenderContext<TState = unknown> {
	readonly viewId: string;
	readonly isFocused: boolean;
	readonly width?: number;
	readonly height?: number;
	readonly state?: TState;
	readonly mode?: EditorMode;
	readonly focusedInteractionId?: string;
	onEmitAction?(actionId: string, payload?: unknown): void;
}

export interface ExtensionTabRenderContext<TState = unknown> {
	readonly tabId: string;
	readonly isFocused: boolean;
	readonly width?: number;
	readonly height?: number;
	readonly state?: TState;
	readonly mode?: EditorMode;
	readonly focusedInteractionId?: string;
	onEmitAction?(actionId: string, payload?: unknown): void;
}

export interface ExtensionViewProvider<
	TRenderResult = unknown,
	TState = unknown,
> extends ExtensionInteractionProvider {
	render(context: ExtensionViewRenderContext<TState>): TRenderResult;
}

export interface ExtensionTabProvider<TRenderResult = unknown, TState = unknown>
	extends ExtensionInteractionProvider {
	render(context: ExtensionTabRenderContext<TState>): TRenderResult;
}

export interface CommandHandler {
	execute(...args: unknown[]): Promise<unknown> | unknown;
}

export interface WorkspaceInputEvent {
	readonly type: "key" | "pointer" | "wheel";
	readonly action?: "press" | "release" | "move" | "drag";
	readonly button?: "left" | "middle" | "right";
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
	readonly mode?: EditorMode;
	readonly emitAction: (actionId: string, payload?: unknown) => void;
}

export interface ExtensionInteractionProvider {
	handleAction?(
		actionId: string,
		payload: unknown,
		context: ExtensionInteractionContext,
	): Promise<WorkspaceInputResult> | WorkspaceInputResult;
	getInteractionModel?(
		context: ExtensionInteractionContext,
	): readonly ExtensionInteraction[];
	handleInput?(
		event: WorkspaceInputEvent,
		context: ExtensionInteractionContext,
	): Promise<WorkspaceInputResult> | WorkspaceInputResult;
}
