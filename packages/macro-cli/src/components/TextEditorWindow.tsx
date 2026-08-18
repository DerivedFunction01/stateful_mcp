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
	readonly previewText?: string;
}

export interface TextEditorDiagnostic {
	readonly line: number;
	readonly col: number;
	readonly message: string;
	readonly severity: "error" | "warning";
}

export interface TextEditorLineParserResult {
	/** Highlight tokens for rendering the line */
	readonly tokens: readonly TextEditorToken[];
	/** Optional live preview or compiled output string */
	readonly previewText?: string;
	/** Whether this line represents a complete, runnable statement */
	readonly isCompleteStatement?: boolean;
	/** Optional syntax or validation diagnostic */
	readonly diagnostic?: TextEditorDiagnostic;
}

/** Replaceable, pluggable line parser function */
export type TextEditorLineParser = (
	lineText: string,
	lineNumber: number,
	context?: unknown,
) => TextEditorLineParserResult;

export interface TuiEditorInstruction {
	readonly text: string;
	readonly variant?: "info" | "tip" | "warning";
}

export interface TuiEditorExampleHint {
	readonly label: string;
	readonly sample: string;
	readonly description?: string;
}

/** Default generic tokenizer: splits strings, numbers, punctuation, and identifiers without assuming domain syntax */
export function createGenericLineParser(): TextEditorLineParser {
	return (lineText: string): TextEditorLineParserResult => {
		const tokens: TextEditorToken[] = [];
		if (!lineText) {
			return { tokens: [{ text: "", color: undefined }] };
		}

		const regex =
			/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\d+(?:\.\d+)?|[{}[\](),:;=]|\s+|[^\s{}[\](),:;="'`]+)/g;
		let match: RegExpExecArray | null;
		while (true) {
			match = regex.exec(lineText);
			if (match === null) break;
			const text = match[0];
			if (/^["'`]/.test(text)) {
				tokens.push({ text, color: "string" });
			} else if (/^\d/.test(text)) {
				tokens.push({ text, color: "accent" });
			} else if (/^[{}[\](),:;=]$/.test(text)) {
				tokens.push({ text, color: "punct" });
			} else if (/^[a-zA-Z_$][a-zA-Z0-9_$]*:/.test(text)) {
				tokens.push({ text, color: "key" });
			} else {
				tokens.push({ text, color: undefined });
			}
		}

		return { tokens };
	};
}

export interface TextEditorWindowProps {
	readonly documentUri: string;
	readonly lines: readonly TextEditorLine[];
	readonly cursorLine?: number;
	readonly cursorCol?: number;
	readonly languageId?: string;
	readonly isDirty?: boolean;
	readonly diagnostics?: readonly TextEditorDiagnostic[];
	readonly instructions?: readonly TuiEditorInstruction[];
	readonly exampleHints?: readonly TuiEditorExampleHint[];
	readonly livePreview?: string;
	readonly lineParser?: TextEditorLineParser;
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
	instructions,
	exampleHints,
	livePreview,
	lineParser,
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

	// Calculate active line preview if lineParser or line preview is present
	const currentLineObj = lines.find((l) => l.num === cursorLine);
	const activeLivePreview =
		livePreview ??
		currentLineObj?.previewText ??
		(lineParser && currentLineObj
			? lineParser(
					currentLineObj.tokens.map((t) => t.text).join(""),
					cursorLine,
				).previewText
			: undefined);

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
					{documentUri.includes("://")
						? documentUri.split("://")[0] + " › "
						: "file › "}
				</text>
				<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
					{documentUri.split("/").pop() ?? documentUri}
				</text>
				<box flexGrow={1} />
				{isDirty && (
					<text fg={c.accentPeach} attributes={TextAttributes.BOLD}>
						{translate(i18n, "textEditor.unsaved")}
					</text>
				)}
			</box>

			{/* 2. Optional Instructions Banner */}
			{instructions && instructions.length > 0 && (
				<box
					flexDirection="column"
					backgroundColor={c.bgSurface}
					paddingLeft={2}
					paddingRight={2}
					paddingTop={0}
					paddingBottom={0}
					borderStyle="single"
					borderColor={c.borderSubtle}
				>
					{instructions.map((inst, idx) => {
						const icon =
							inst.variant === "warning"
								? "⚠️"
								: inst.variant === "tip"
									? "💡"
									: "ℹ️";
						const fgColor =
							inst.variant === "warning"
								? c.statusWarning
								: inst.variant === "tip"
									? c.accentSecondary
									: c.accentPrimary;
						return (
							<box key={idx} height={1} flexDirection="row">
								<text fg={fgColor} attributes={TextAttributes.BOLD}>
									{icon}{" "}
								</text>
								<text fg={c.fgSecondary}>{inst.text}</text>
							</box>
						);
					})}
				</box>
			)}

			{/* 3. Optional Read-Only Reference Example Hints */}
			{exampleHints && exampleHints.length > 0 && (
				<box
					flexDirection="column"
					backgroundColor={c.bgActive}
					paddingLeft={2}
					paddingRight={2}
					paddingTop={0}
					paddingBottom={0}
				>
					<text fg={c.fgDim} attributes={TextAttributes.DIM}>
						{translate(i18n, "textEditor.references")}
					</text>
					{exampleHints.map((ex, idx) => (
						<box key={idx} height={1} flexDirection="row">
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								• {ex.label}:{" "}
							</text>
							<text fg={c.fgPrimary}>{ex.sample} </text>
							{ex.description && (
								<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
									({ex.description})
								</text>
							)}
						</box>
					))}
				</box>
			)}

			{/* 4. Multi-line Buffer Area */}
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
									attributes={
										isCurrent ? TextAttributes.BOLD : TextAttributes.DIM
									}
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
							{translate(i18n, "textEditor.diagnostic", {
								message: diagnostics[0]?.message ?? "",
							})}
						</text>
					</box>
				)}
			</box>

			{/* 5. Live Statement Output Preview Box */}
			{activeLivePreview && (
				<box
					height={1}
					backgroundColor={c.bgActive}
					paddingLeft={2}
					paddingRight={2}
					flexDirection="row"
					alignItems="center"
				>
					<text fg={c.accentSecondary} attributes={TextAttributes.BOLD}>
						{translate(i18n, "textEditor.liveOutput")}{" "}
					</text>
					<text fg={c.fgPrimary}>{activeLivePreview}</text>
				</box>
			)}

			{/* 6. Bottom Status Bar */}
			<TuiStatusBar
				mode="NORMAL"
				sessionTitle={documentUri}
				cursorLine={cursorLine}
				cursorCol={cursorCol}
				diagnosticErrorCount={
					diagnostics.filter((d) => d.severity === "error").length
				}
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
	const cursorCol = 1;
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

		handleAction(
			actionId: string,
			_payload: unknown,
			_context: ExtensionInteractionContext,
		): WorkspaceInputResult {
			switch (actionId) {
				case "cursor.moveDown":
					cursorLine = Math.min(lines.length, cursorLine + 1);
					return "handled";
				case "cursor.moveUp":
					cursorLine = Math.max(1, cursorLine - 1);
					return "handled";
				case "cursor.moveLeft":
					return "handled";
				case "cursor.moveRight":
					return "handled";
				case "editor.save":
					isDirty = false;
					return "handled";
				default:
					return "ignored";
			}
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
				cursorLine = Math.max(
					1,
					Math.min(lines.length, cursorLine + (delta > 0 ? 1 : -1)),
				);
				return "handled";
			}

			return "ignored";
		},
	};
}
