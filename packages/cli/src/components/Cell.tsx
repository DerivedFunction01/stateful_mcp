import type { Cell } from "@stateful-mcp/clinical/session/cell";
import type { EditorMode } from "@stateful-mcp/clinical/session/editor-mode";
import { Box, Text } from "ink";
import { useMemo } from "react";
import { formatParsedItem } from "../formatter/format-parsed";
import type { CellSuggestion } from "../hooks/useNotebook";
import { t } from "../lib/shared/i18n";

interface CellProps {
	cell: Cell;
	index: number;
	isActive: boolean;
	mode: EditorMode;
	draftText?: string;
	isSelected?: boolean;
	suggestions?: CellSuggestion[];
}

const STATUS_COLORS: Record<string, string> = {
	draft: "yellow",
	parsing: "blue",
	pending_commit: "cyan",
	committed: "green",
	error: "red",
	deleted: "gray",
	locked: "magenta",
};

const STATUS_SYMBOLS: Record<string, string> = {
	draft: "○",
	parsing: "◌",
	pending_commit: "◎",
	committed: "●",
	error: "✗",
	deleted: "—",
	locked: "🔒",
};

function relativeTime(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const secs = Math.floor(diff / 1000);
	if (secs < 60) return "just now";
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function CellComponent({
	cell,
	index,
	isActive,
	mode,
	draftText,
	isSelected,
	suggestions,
}: CellProps) {
	const prefix = isActive ? "▸" : isSelected ? ">" : " ";
	const ordinal = String(index + 1).padStart(2, "0");
	const statusColor = STATUS_COLORS[cell.status] ?? "white";
	const symbol = STATUS_SYMBOLS[cell.status] ?? "?";
	const isEditing = isActive && mode === "INSERT";

	const displayText = isEditing ? (draftText ?? cell.rawInput) : cell.rawInput;

	const path = [
		cell.routing.resolvedSection,
		cell.routing.targetSchema ?? cell.routing.resolvedSchema,
	]
		.filter(Boolean)
		.join(" >> ");
	const pathInfo = path ? ` · ${path}` : "";
	const ws =
		cell.collection.kind === "workspace"
			? ` @ ${cell.collection.collectionId.slice(0, 12)}`
			: "";

	const lockInfo = cell.lockedAt
		? ` · ${STATUS_SYMBOLS["locked"]} ${relativeTime(cell.lockedAt)}`
		: "";
	const timeInfo = cell.updatedAt ? ` · ${relativeTime(cell.updatedAt)}` : "";
	const narrativeInfo =
		cell.metadata?.stopWordRatio && Number(cell.metadata.stopWordRatio) > 0.6
			? ` · narrative`
			: "";
	const templateInfo = cell.metadata?.matchedTemplate
		? ` · template:${cell.metadata.matchedTemplate}`
		: "";

	const fieldCount =
		cell.status === "committed" && cell.parsedOutput
			? cell.parsedOutput.reduce(
					(n, item) => n + Object.keys(item.extractedData ?? {}).length,
					0,
				)
			: 0;
	const commitSummary =
		cell.status === "committed"
			? ` · ${fieldCount} fields${cell.routing.resolvedSchema ? ` @ ${cell.routing.resolvedSchema}` : ""}`
			: "";
	const interpretationInfo = (() => {
		if (!isActive || cell.status !== "committed") return "";
		const confidence = cell.interpretation?.confidence;
		if (!confidence) return " · confidence unavailable";
		return ` · confidence: ${confidence.level}`;
	})();

	const statusLine = (() => {
		const base = pathInfo + ws;
		const status = (key: string, symbol: string) => `${symbol} ${t(key)}`;
		switch (cell.status) {
			case "draft":
				return `${status("status.draft", "○")}${base}${narrativeInfo}${templateInfo}${timeInfo}${lockInfo}`;
			case "committed":
				return `${status("status.committed", "●")}${commitSummary}${interpretationInfo}${narrativeInfo}${templateInfo}${timeInfo}${lockInfo}`;
			case "error":
				return `✗ ${cell.errorMessage ?? "unknown"}`;
			default:
				return `${symbol} ${cell.status}${base}${timeInfo}`;
		}
	})();

	const actions = useMemo(() => {
		if (!isActive) return [];
		if (mode === "NORMAL") {
			return [
				{ key: "r", label: "run" },
				{ key: "P", label: "preview" },
				{ key: "dd", label: "del" },
				{ key: "yy", label: "yank" },
				{ key: "o", label: "ins↓" },
				{ key: "O", label: "ins↑" },
				{ key: "i", label: "edit" },
				{ key: "I", label: "info" },
				{ key: ":", label: "cmd" },
			];
		}
		if (mode === "INSERT") {
			return [
				{ key: "Esc", label: "normal" },
				{ key: ":w", label: "save" },
			];
		}
		if (mode === "VISUAL") {
			return [
				{ key: "r", label: "run" },
				{ key: "d", label: "del" },
				{ key: "y", label: "yank" },
				{ key: "Esc", label: "normal" },
				{ key: ":", label: "cmd" },
			];
		}
		if (mode === "COMMAND") {
			return [
				{ key: "Enter", label: "exec" },
				{ key: "Esc", label: "cancel" },
				{ key: "Tab", label: "cycle" },
			];
		}
		if (mode === "MACRO") {
			return [
				{ key: "Ctrl+Enter", label: "submit batch" },
				{ key: "Enter", label: "new line" },
				{ key: "Esc", label: "cancel" },
			];
		}
		return [];
	}, [isActive, mode]);

	const textRows = displayText.split("\n");

	// Border emphasis by state
	const outerBorderColor = isSelected ? "magenta" : isActive ? "green" : "gray";
	const innerBorderColor = isActive ? "cyan" : "gray";
	const headerColor = isActive ? "bold" : isSelected ? "bold" : "normal";

	return (
		<Box
			flexDirection="column"
			marginBottom={1}
			borderStyle="single"
			borderColor={outerBorderColor}
			paddingLeft={1}
			paddingRight={1}
			paddingTop={0}
			paddingBottom={0}
		>
			{/* HEADER — identity */}
			<Box>
				<Text bold={headerColor === "bold"}>
					{prefix}[{ordinal}]{" "}
					<Text color="cyan" bold={headerColor === "bold"}>
						({cell.mode})
					</Text>
					<Text color="gray">
						{pathInfo}
						{ws}
					</Text>
				</Text>
			</Box>

			{/* ACTION BAR — per-cell actions, only for active cell */}
			{actions.length > 0 && (
				<Box marginLeft={1}>
					<Text color="gray" dimColor>
						{actions.map((a, i) => (
							<Text key={a.key}>
								{i > 0 ? " " : ""}
								<Text color="cyan">[{a.key}]</Text>
								<Text>{a.label}</Text>
							</Text>
						))}
					</Text>
				</Box>
			)}

			{/* INNER TEXT BOX — editable content */}
			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor={innerBorderColor}
				paddingLeft={1}
				paddingRight={1}
			>
				{textRows.map((row, i) => (
					<Box key={i}>
						<Text bold={isActive}>{row || " "}</Text>
					</Box>
				))}
				{isActive && textRows.length === 0 && (
					<Box>
						<Text color="gray" dimColor>
							(empty)
						</Text>
					</Box>
				)}

				{/* Suggestions INSIDE text box, below the text */}
				{suggestions && suggestions.length > 0 && (
					<>
						<Box>
							<Text color={innerBorderColor}>┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈</Text>
						</Box>
						<Box flexDirection="column">
							{suggestions.slice(0, 5).map((s, i) => (
								<Box key={i}>
									<Text dimColor>
										{" "}
										▸ {s.text}
										{s.detail ? <Text color="gray"> — {s.detail}</Text> : null}
									</Text>
								</Box>
							))}
						</Box>
					</>
				)}
			</Box>

			{/* RESULTS AREA — rendered output for committed cells */}
			{cell.status === "committed" && cell.parsedOutput && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="gray"
					paddingLeft={1}
					paddingRight={1}
					marginTop={1}
				>
					{cell.parsedOutput.map((item, i) => {
						const fmt = formatParsedItem(item);
						return (
							<Box key={i} flexDirection="column">
								{fmt.fields.length === 0 && fmt.concepts.length === 0 ? (
									<Box>
										<Text color="gray" dimColor>
											[{i + 1}] {item.targetSchema} — (no extracted fields)
										</Text>
									</Box>
								) : (
									<>
										<Box>
											<Text color="green" bold>
												[{i + 1}] {item.targetSchema}
											</Text>
										</Box>
										{fmt.fields.map((f, fi) => (
											<Box key={fi}>
												<Text color="gray">
													{"  "}• {f.field}:{" "}
												</Text>
												<Text>
													{typeof f.value === "object"
														? JSON.stringify(f.value)
														: String(f.value ?? "—")}
												</Text>
											</Box>
										))}
										{fmt.concepts.map((c, ci) => (
											<Box key={ci}>
												<Text color="gray">{"  "}• </Text>
												<Text>
													{c.id ?? "?"} = {c.display}
												</Text>
											</Box>
										))}
									</>
								)}
							</Box>
						);
					})}
				</Box>
			)}

			{cell.status === "committed" && cell.macro?.rendered?.confirmation && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="yellow"
					paddingLeft={1}
					paddingRight={1}
					marginTop={1}
				>
					<Text color="yellow" bold>
						Macro confirmation
					</Text>
					{cell.macro.rendered.confirmation.map((item, i) => (
						<Text key={i} color={item.status === "resolved" ? "green" : "yellow"}>
							{item.line}. {item.text}
						</Text>
					))}
				</Box>
			)}

			{/* FOOTER — state */}
			<Box marginTop={1}>
				<Text color={statusColor}>{statusLine}</Text>
			</Box>
		</Box>
	);
}
