import { TextAttributes } from "@opentui/core";
import type { I18nKernel } from "@stateful-mcp/macro";
import { translate } from "../../locales";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface TuiCompletionParam {
	readonly name: string;
	readonly type?: string;
	readonly description?: string;
	readonly required?: boolean;
}

export interface TuiCompletionCandidate {
	readonly id: string;
	readonly label: string;
	readonly kind?:
		| "Macro"
		| "Slot"
		| "Snippet"
		| "Function"
		| "Variable"
		| "Property"
		| string;
	readonly detail?: string;
	readonly documentation?: string;
	readonly params?: readonly TuiCompletionParam[];
	readonly snippet?: string;
}

export interface TuiCompletionKeymapHints {
	readonly completeKey?: string;
	readonly insertKey?: string;
	readonly dismissKey?: string;
	readonly navigateKey?: string;
}

export interface TuiCompletionPopupProps {
	readonly candidates: readonly TuiCompletionCandidate[];
	readonly selectedIndex?: number;
	readonly width?: number;
	readonly maxVisible?: number;
	readonly showSidecar?: boolean;
	readonly filterText?: string;
	readonly theme?: TuiThemeDefinition;
	readonly i18n?: I18nKernel;
	readonly keymap?: TuiCompletionKeymapHints;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getKindIcon(kind?: string): {
	icon: string;
	defaultColorKey:
		| "accentAmber"
		| "accentSecondary"
		| "statusSuccess"
		| "accentPrimary"
		| "fgMuted";
} {
	switch (kind?.toLowerCase()) {
		case "macro":
			return { icon: "⚡", defaultColorKey: "accentAmber" };
		case "slot":
		case "param":
			return { icon: "⬡", defaultColorKey: "accentSecondary" };
		case "snippet":
			return { icon: "✂", defaultColorKey: "statusSuccess" };
		case "function":
			return { icon: "λ", defaultColorKey: "accentPrimary" };
		case "property":
		case "variable":
			return { icon: "●", defaultColorKey: "accentSecondary" };
		default:
			return { icon: "◆", defaultColorKey: "fgMuted" };
	}
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function TuiCompletionPopup({
	candidates,
	selectedIndex = 0,
	width = 68,
	maxVisible = 6,
	showSidecar = true,
	filterText = "",
	theme,
	i18n,
	keymap = {},
}: TuiCompletionPopupProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;

	// Resolve keymap hints with defaults
	const completeKey = keymap.completeKey ?? "Tab";
	const insertKey = keymap.insertKey ?? "↵";
	const dismissKey = keymap.dismissKey ?? "Esc";
	const navigateKey = keymap.navigateKey ?? "↑↓";

	// Localized strings
	const titleText = translate(i18n, "completion.title", "Completions");
	const noMatchesText = translate(
		i18n,
		"completion.noMatches",
		"No matching completions",
	);
	const headerHint = translate(
		i18n,
		"completion.headerHint",
		`${completeKey} Complete · ${insertKey} Insert`,
		{
			completeKey,
			insertKey,
		},
	);
	const footerHint = translate(
		i18n,
		"completion.footerHint",
		`${navigateKey} Select candidate   ${insertKey} Insert   ${dismissKey} Dismiss`,
		{
			navigateKey,
			insertKey,
			dismissKey,
		},
	);
	const paramsLabel = translate(i18n, "completion.parameters", "Parameters:");
	const snippetLabel = translate(i18n, "completion.snippet", "Snippet:");
	const noDetailsText = translate(
		i18n,
		"completion.noDetails",
		"No details available",
	);

	if (candidates.length === 0) {
		return (
			<box
				borderStyle="single"
				borderColor={c.borderDefault}
				backgroundColor={c.bgElevated}
				padding={1}
				width={Math.min(36, width)}
			>
				<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
					{noMatchesText}
				</text>
			</box>
		);
	}

	const safeSelectedIdx = Math.max(
		0,
		Math.min(candidates.length - 1, selectedIndex),
	);
	const selectedCandidate = candidates[safeSelectedIdx];

	// Scroll window for visible candidates
	const totalCandidates = candidates.length;
	let startIdx = 0;
	if (safeSelectedIdx >= maxVisible) {
		startIdx = Math.min(
			safeSelectedIdx - maxVisible + 1,
			totalCandidates - maxVisible,
		);
	}
	const visibleCandidates = candidates.slice(startIdx, startIdx + maxVisible);

	// Layout width calculations
	const listWidth = showSidecar
		? Math.max(26, Math.floor(width * 0.44))
		: width;
	const sidecarWidth = showSidecar ? Math.max(28, width - listWidth - 3) : 0;

	return (
		<box
			flexDirection="column"
			borderStyle="single"
			borderColor={c.borderActive}
			backgroundColor={c.bgElevated}
			width={width}
		>
			{/* Top Header Bar */}
			<box
				flexDirection="row"
				height={1}
				backgroundColor={c.bgActive}
				paddingLeft={1}
				paddingRight={1}
			>
				<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
					{titleText}
				</text>
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{" "}
					({safeSelectedIdx + 1}/{totalCandidates})
				</text>
				<box flexGrow={1} />
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{headerHint}
				</text>
			</box>

			{/* Main Split: Candidate List & Doc Sidecar */}
			<box flexDirection="row">
				{/* 1. Candidate List Column */}
				<box flexDirection="column" width={listWidth}>
					{visibleCandidates.map((candidate, relativeIdx) => {
						const actualIdx = startIdx + relativeIdx;
						const isSelected = actualIdx === safeSelectedIdx;
						const kindMeta = getKindIcon(candidate.kind);
						const kindColor = c[kindMeta.defaultColorKey];

						const rowBg = isSelected ? c.bgActive : undefined;
						const pillarFg = isSelected ? c.accentPrimary : "transparent";

						// Label highlighting against filterText
						const labelStr = candidate.label;
						const isMatched =
							filterText &&
							labelStr.toLowerCase().startsWith(filterText.toLowerCase());

						return (
							<box
								key={candidate.id}
								height={1}
								flexDirection="row"
								backgroundColor={rowBg}
								paddingLeft={0}
								paddingRight={1}
							>
								{/* Left Selection Pillar */}
								<text fg={pillarFg} attributes={TextAttributes.BOLD}>
									{isSelected ? "▎" : " "}
								</text>

								{/* Kind Icon */}
								<text fg={kindColor} attributes={TextAttributes.BOLD}>
									{kindMeta.icon}{" "}
								</text>

								{/* Candidate Label */}
								<text
									fg={
										isSelected
											? c.fgPrimary
											: isMatched
												? c.accentAmber
												: c.fgSecondary
									}
									attributes={isSelected || isMatched ? TextAttributes.BOLD : 0}
								>
									{labelStr}
								</text>

								<box flexGrow={1} />

								{/* Kind Tag */}
								{candidate.kind && (
									<text
										fg={isSelected ? kindColor : c.fgDim}
										attributes={
											isSelected ? TextAttributes.BOLD : TextAttributes.DIM
										}
									>
										{candidate.kind}
									</text>
								)}
							</box>
						);
					})}

					{/* List Overflow Indicator */}
					{totalCandidates > maxVisible && (
						<box height={1} paddingLeft={1} backgroundColor={c.bgSurface}>
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								{startIdx > 0 ? "▲ " : ""}
								{translate(
									i18n,
									"completion.moreItems",
									`+${totalCandidates - maxVisible} more`,
									{
										count: totalCandidates - maxVisible,
									},
								)}
								{startIdx + maxVisible < totalCandidates ? " ▼" : ""}
							</text>
						</box>
					)}
				</box>

				{/* Vertical Separator */}
				{showSidecar && (
					<box width={1} flexDirection="column">
						{Array.from(
							{ length: Math.max(visibleCandidates.length, 4) },
							(_, i) => (
								<text key={i} fg={c.borderSubtle}>
									│
								</text>
							),
						)}
					</box>
				)}

				{/* 2. Documentation Sidecar Column */}
				{showSidecar && (
					<box
						flexDirection="column"
						width={sidecarWidth}
						paddingLeft={1}
						paddingRight={1}
					>
						{selectedCandidate ? (
							<>
								{/* Signature Header */}
								<box
									flexDirection="row"
									height={1}
									backgroundColor={c.bgSurface}
									paddingLeft={1}
									paddingRight={1}
									marginBottom={1}
								>
									<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
										{selectedCandidate.detail ?? selectedCandidate.label}
									</text>
								</box>

								{/* Main Doc Explanation */}
								{selectedCandidate.documentation && (
									<box marginBottom={1}>
										<text fg={c.fgSecondary}>
											{selectedCandidate.documentation}
										</text>
									</box>
								)}

								{/* Structured Parameter Breakdown */}
								{selectedCandidate.params &&
									selectedCandidate.params.length > 0 && (
										<box flexDirection="column" marginBottom={1}>
											<text fg={c.fgDim} attributes={TextAttributes.DIM}>
												{paramsLabel}
											</text>
											{selectedCandidate.params.map((p) => (
												<box key={p.name} flexDirection="row" height={1}>
													<text
														fg={c.accentAmber}
														attributes={TextAttributes.BOLD}
													>
														{" • "}
														{p.name}
													</text>
													{p.type && (
														<text fg={c.fgDim} attributes={TextAttributes.DIM}>
															: {p.type}
														</text>
													)}
													{p.description && (
														<text fg={c.fgMuted}> - {p.description}</text>
													)}
												</box>
											))}
										</box>
									)}

								{/* Code Snippet Preview */}
								{selectedCandidate.snippet && (
									<box
										backgroundColor={c.bgCanvas}
										paddingLeft={1}
										paddingRight={1}
										borderStyle="single"
										borderColor={c.borderSubtle}
									>
										<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
											{snippetLabel}{" "}
										</text>
										<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
											{selectedCandidate.snippet}
										</text>
									</box>
								)}
							</>
						) : (
							<text fg={c.fgDim} attributes={TextAttributes.DIM}>
								{noDetailsText}
							</text>
						)}
					</box>
				)}
			</box>

			{/* Footer Keybinding Hints */}
			<box
				flexDirection="row"
				height={1}
				backgroundColor={c.bgSurface}
				paddingLeft={1}
				paddingRight={1}
			>
				<text fg={c.fgDim} attributes={TextAttributes.DIM}>
					{footerHint}
				</text>
			</box>
		</box>
	);
}
