import { TextAttributes } from "@opentui/core";
import type {
	EditorKeymapProfile,
	ExtensionInteractionContext,
	ExtensionTabProvider,
	ExtensionTabRenderContext,
	I18nKernel,
	MacroWorkspace,
	WorkspaceInputEvent,
	WorkspaceInputResult,
} from "@stateful-mcp/macro";
import { translate } from "../locales";
import { TuiStatusBar } from "../ui/primitives/TuiStatusBar";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../ui/theme";

export interface TextEditorToken {
	readonly text: string;
	readonly color?: "key" | "string" | "punct" | "accent" | "dim" | "error";
}

export interface TextEditorLine {
	readonly num: number;
	readonly tokens: readonly TextEditorToken[];
	readonly isCursorLine?: boolean;
	readonly hasGutterMarker?: "dirty" | "error";
}

export interface TextEditorDiagnostic {
	readonly line: number;
	readonly col: number;
	readonly message: string;
	readonly severity: "error" | "warning";
}

export interface TextEditorWindowProps {
	readonly documentUri: string;
	readonly lines: readonly TextEditorLine[];
	readonly cursorLine?: number;
	readonly cursorCol?: number;
	readonly languageId?: string;
	readonly isDirty?: boolean;
	readonly diagnostics?: readonly TextEditorDiagnostic[];
	readonly width?: number;
	readonly height?: number;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
}

export function TextEditorWindowView({
	documentUri,
	lines,
	cursorLine = 1,
	cursorCol = 1,
	languageId = "JSON",
	isDirty = false,
	diagnostics = [],
	width,
	height,
	theme: propTheme,
	i18n,
}: TextEditorWindowProps) {
	const theme = propTheme ?? GlobalThemeRegistry.getActive();
	const c = theme.colors;

	const totalWidth = width ?? 100;
	const totalHeight = height ?? 24;

	function getTokenColor(colorKind?: TextEditorToken["color"]): string {
		switch (colorKind) {
			case "key":
				return c.accentPrimary;
			case "string":
				return c.accentAmber;
			case "punct":
				return c.fgMuted;
			case "accent":
				return c.accentSecondary;
			case "error":
				return c.statusError;
			case "dim":
				return c.fgDim;
			default:
				return c.fgPrimary;
		}
	}

	return (
		<box
			flexDirection="column"
			width={totalWidth}
			height={totalHeight}
			backgroundColor={c.bgCanvas}
			borderStyle="single"
			borderColor={c.borderDefault}
		>
			{/* 1. Document Breadcrumb Header */}
			<box
				height={1}
				paddingLeft={2}
				paddingRight={2}
				backgroundColor={c.bgElevated}
				flexDirection="row"
				alignItems="center"
			>
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{documentUri.includes("://") ? documentUri.split("://")[0] + " › " : "file › "}
				</text>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{documentUri.split("/").pop() ?? documentUri}
				</text>
				<box flexGrow={1} />
				{isDirty && (
					<text fg={c.accentPeach} attributes={TextAttributes.BOLD}>
						{translate(i18n, "textEditor.unsaved", "● Unsaved Changes")}
					</text>
				)}
			</box>

			{/* 2. Multi-line Buffer Area */}
			<box
				flexDirection="column"
				flexGrow={1}
				paddingTop={1}
				paddingLeft={1}
				paddingRight={1}
				backgroundColor={c.bgCanvas}
			>
				{lines.map((line) => {
					const isCurrent = line.num === cursorLine;
					return (
						<box
							key={line.num}
							height={1}
							flexDirection="row"
							backgroundColor={isCurrent ? c.bgElevated : undefined}
						>
							{/* Gutter (Marker + Line Number) */}
							<box width={2}>
								{line.hasGutterMarker === "dirty" && (
									<text fg={c.statusWarning} attributes={TextAttributes.BOLD}>
										▌
									</text>
								)}
								{line.hasGutterMarker === "error" && (
									<text fg={c.statusError} attributes={TextAttributes.BOLD}>
										ⓧ
									</text>
								)}
							</box>
							<box width={4}>
								<text
									fg={isCurrent ? c.accentPrimary : c.fgDim}
									attributes={isCurrent ? TextAttributes.BOLD : TextAttributes.DIM}
								>
									{String(line.num).padStart(2, " ")}
								</text>
							</box>

							{/* Line Tokens */}
							<box flexDirection="row">
								{line.tokens.map((token, idx) => (
									<text
										key={idx}
										fg={getTokenColor(token.color)}
										attributes={token.color === "key" ? TextAttributes.BOLD : 0}
									>
										{token.text}
									</text>
								))}
							</box>
						</box>
					);
				})}

				{/* Diagnostic Error Box Callout if present */}
				{diagnostics.length > 0 && (
					<box
						marginTop={1}
						marginLeft={6}
						paddingLeft={1}
						paddingRight={1}
						backgroundColor={c.bgElevated}
						borderStyle="single"
						borderColor={c.statusError}
						flexDirection="row"
					>
						<text fg={c.statusError} attributes={TextAttributes.BOLD}>
							ⓧ{" "}
						</text>
						<text fg={c.fgPrimary}>
							{translate(i18n, "textEditor.diagnostic", diagnostics[0]?.message ?? "", {
								message: diagnostics[0]?.message ?? "",
							})}
						</text>
					</box>
				)}
			</box>

			{/* 3. Bottom Status Bar */}
			<TuiStatusBar
				mode="NORMAL"
				sessionTitle={documentUri}
				cursorLine={cursorLine}
				cursorCol={cursorCol}
				diagnosticErrorCount={diagnostics.filter((d) => d.severity === "error").length}
				theme={theme}
			/>
		</box>
	);
}

export function createTextEditorTabProvider(
	workspace: MacroWorkspace,
	uri: string,
	initialContent: string,
	keymap?: EditorKeymapProfile,
): ExtensionTabProvider {
	let cursorLine = 1;
	let cursorCol = 1;
	let isDirty = false;

	const rawLines = initialContent.split("\n");
	const lines: TextEditorLine[] = rawLines.map((text, idx) => ({
		num: idx + 1,
		tokens: [{ text, color: "punct" }],
		isCursorLine: idx === 0,
	}));

	return {
		render(context: ExtensionTabRenderContext) {
			return (
				<TextEditorWindowView
					documentUri={uri}
					lines={lines}
					cursorLine={cursorLine}
					cursorCol={cursorCol}
					isDirty={isDirty}
					i18n={workspace.i18n}
				/>
			);
		},

		handleInput(
			event: WorkspaceInputEvent,
			context: ExtensionInteractionContext,
		): WorkspaceInputResult {
			if (event.type === "pointer" && event.action === "press") {
				if (event.y !== undefined && event.y >= 3) {
					cursorLine = Math.min(lines.length, Math.max(1, event.y - 2));
					return "handled";
				}
			}

			if (event.type === "wheel") {
				const delta = event.delta ?? 1;
				cursorLine = Math.max(1, Math.min(lines.length, cursorLine + (delta > 0 ? 1 : -1)));
				return "handled";
			}

			const key = (event.key || event.input || "").toLowerCase();
			if (key === "j" || key === "down") {
				cursorLine = Math.min(lines.length, cursorLine + 1);
				return "handled";
			}
			if (key === "k" || key === "up") {
				cursorLine = Math.max(1, cursorLine - 1);
				return "handled";
			}

			if (key === "s" && event.ctrl) {
				isDirty = false;
				return "handled";
			}

			return "ignored";
		},
	};
}
