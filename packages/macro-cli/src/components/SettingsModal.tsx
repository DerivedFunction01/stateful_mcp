import type { MacroWorkspace } from "@stateful-mcp/macro";
import { SettingsWindowView } from "./SettingsWindow";
import {
	createGenericLineParser,
	TextEditorWindowView,
	type TextEditorDiagnostic,
	type TextEditorLine,
} from "./TextEditorWindow";
import type { TuiThemeDefinition } from "../ui/theme";
import { HelpBar } from "./HelpBar";
import { TuiButton } from "../ui/primitives/TuiButton";
import { translate } from "../locales";

export function SettingsModal({
	workspace,
	width,
	height,
	theme,
}: {
	workspace: MacroWorkspace;
	width: number;
	height: number;
	theme?: TuiThemeDefinition;
}) {
	const controller = workspace.settingsModal;
	if (!controller) return null;
	const controllerSnapshot = controller.getSnapshot();
	const modelSnapshot = controller.model.getSnapshot();
	const modalFooter = (
		<box flexDirection="column" width={width}>
			<box flexDirection="row" height={1} marginTop={1}>
				<text fg={modelSnapshot.hasErrors ? "#f87171" : "#94a3b8"}>
					{modelSnapshot.hasErrors
						? translate(workspace.i18n, "settings.status.errors")
						: modelSnapshot.totalModifiedCount > 0
							? translate(workspace.i18n, "settings.status.modified", { count: modelSnapshot.totalModifiedCount })
							: translate(workspace.i18n, "settings.status.saved")}
				</text>
				<box flexGrow={1} />
				<box onMouseDown={() => controller.confirmClose("save")}>
					<TuiButton
						label={translate(workspace.i18n, "settings.saveAndClose")}
						isFocused={controllerSnapshot.focus === "actions"}
						disabled={modelSnapshot.hasErrors}
						theme={theme}
					/>
				</box>
			</box>
			<HelpBar keymap={(workspace.runtime as { context?: { keymap?: import("@stateful-mcp/macro").EditorKeymapProfile } }).context?.keymap} workspace={workspace} theme={theme} twoRow />
		</box>
	);
	if (controllerSnapshot.dialog === "discard") {
		return (
			<box position="absolute" width="100%" height="100%" backgroundColor="rgba(0, 0, 0, 0.72)" alignItems="center" justifyContent="center">
				<box width={Math.min(70, width - 4)} flexDirection="column" borderStyle="single" padding={1} backgroundColor="#161b22">
					<text attributes={1} fg="#f8fafc">{translate(workspace.i18n, "settings.unsaved.title")}</text>
					<text fg="#94a3b8">{translate(workspace.i18n, "settings.unsaved.message")}</text>
					<box flexDirection="row" marginTop={1}>
						<box onMouseDown={() => controller.confirmClose("save")}><TuiButton label={translate(workspace.i18n, "settings.saveAndClose")} theme={theme} /></box>
						<box onMouseDown={() => controller.confirmClose("discard")}><TuiButton label={translate(workspace.i18n, "settings.discard")} theme={theme} /></box>
						<box onMouseDown={() => controller.confirmClose("cancel")}><TuiButton label={translate(workspace.i18n, "settings.keepEditing")} isFocused theme={theme} /></box>
					</box>
				</box>
			</box>
		);
	}
	if (controllerSnapshot.focus === "json") {
		const lines: TextEditorLine[] = modelSnapshot.rawJsonText.split("\n").map((text, index) => ({
			num: index + 1,
			tokens: createGenericLineParser()(text, index + 1).tokens,
			isCursorLine: index === modelSnapshot.rawJsonText.split("\n").length - 1,
		}));
		const cursorBefore = modelSnapshot.rawJsonText.slice(0, controllerSnapshot.jsonCursor);
		const cursorLine = cursorBefore.split("\n").length;
		const cursorCol = (cursorBefore.lastIndexOf("\n") < 0
			? cursorBefore.length
			: cursorBefore.length - cursorBefore.lastIndexOf("\n") - 1) + 1;
		const diagnostics: TextEditorDiagnostic[] = controller.model
			.getDiagnostics()
			.map((diagnostic) => ({
				line: diagnostic.line ?? 1,
				col: diagnostic.column ?? 1,
				message: diagnostic.message,
				severity: diagnostic.severity,
			}));
		return (
			<box position="absolute" width="100%" height="100%">
				<TextEditorWindowView
					documentUri="settings://workspace.json"
					lines={lines}
					cursorLine={cursorLine}
					cursorCol={cursorCol}
					width={width}
					height={height}
					diagnostics={diagnostics}
					theme={theme}
					i18n={workspace.i18n}
				/>
				{modalFooter}
			</box>
		);
	}
	return (
		<box position="absolute" width="100%" height="100%" backgroundColor="rgba(0, 0, 0, 0.55)">
			<box
				position="absolute"
				width={width}
				height={height}
				marginLeft={Math.max(0, Math.floor((width - width) / 2))}
			>
				<SettingsWindowView
					model={controller.model}
					width={width}
					height={height}
					availableProfiles={modelSnapshot.availableProfiles}
					i18n={workspace.i18n}
					focusedRegion={controllerSnapshot.focus === "categories" ? "navigation" : controllerSnapshot.focus === "profile" || controllerSnapshot.focus === "scope" ? "search" : controllerSnapshot.focus === "actions" ? "content" : controllerSnapshot.focus}
					selectedCategoryId={modelSnapshot.sections[controllerSnapshot.selectedCategoryIndex]?.id}
					selectedItemIndex={controllerSnapshot.selectedItemIndex}
					onSelectCategory={(id) => controller.open({ section: id })}
					onSwitchProfile={(id) => void controller.model.switchProfile(id)}
					onScopeChange={(scope) => controller.model.setActiveScope(scope)}
					onOpenJson={() => controller.setFocus("json")}
				/>
				{modalFooter}
			</box>
		</box>
	);
}
