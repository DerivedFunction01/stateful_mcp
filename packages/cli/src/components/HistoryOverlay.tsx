import type {
	CommandHistoryCandidate,
	CommandHistoryScope,
} from "@stateful-mcp/clinical/learning/command-history";
import { Box, Text, useInput, useStdout } from "ink";
import { useMemo, useState } from "react";
import { t } from "../lib/shared/i18n";

type HistoryScope = CommandHistoryScope | "merged";
type HistorySort = "score" | "recent" | "frequency";

interface HistoryOverlayProps {
	candidates: CommandHistoryCandidate[];
	onInsert: (command: string) => void;
	onClose: () => void;
}

function lastUsed(candidate: CommandHistoryCandidate): string {
	const value = candidate.sessionLastUsedAt ?? candidate.allLastUsedAt;
	if (!value) return "";
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return value;
	const elapsed = Math.max(0, Date.now() - timestamp);
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	if (elapsed < minute) return t("history.time.justNow");
	if (elapsed < hour)
		return t("history.time.minutesAgo", {
			value: Math.floor(elapsed / minute),
		});
	if (elapsed < day)
		return t("history.time.hoursAgo", { value: Math.floor(elapsed / hour) });
	if (elapsed < 2 * day) return t("history.time.yesterday");
	return t("history.time.daysAgo", { value: Math.floor(elapsed / day) });
}

function truncate(value: string, width: number): string {
	if (value.length <= width) return value.padEnd(width);
	if (width <= 3) return value.slice(0, width);
	return `${value.slice(0, width - 3)}...`;
}

export function HistoryOverlay({
	candidates,
	onInsert,
	onClose,
}: HistoryOverlayProps) {
	const { stdout } = useStdout();
	const terminalWidth = stdout?.columns ?? 100;
	const [scope, setScope] = useState<HistoryScope>("merged");
	const [sort, setSort] = useState<HistorySort>("score");
	const [filter, setFilter] = useState("");
	const [index, setIndex] = useState(0);
	const commandWidth = Math.max(24, terminalWidth - 57);

	const visible = useMemo(() => {
		const filtered = candidates.filter((candidate) => {
			if (!candidate.commandText.startsWith(filter.toLocaleLowerCase()))
				return false;
			if (scope === "session") return candidate.sessionCount > 0;
			if (scope === "all") return candidate.allCount > 0;
			return true;
		});
		return filtered.sort((a, b) => {
			if (sort === "frequency")
				return b.sessionCount + b.allCount - (a.sessionCount + a.allCount);
			if (sort === "recent") return lastUsed(b).localeCompare(lastUsed(a));
			return (
				b.sessionCount * 2 + b.allCount - (a.sessionCount * 2 + a.allCount)
			);
		});
	}, [candidates, filter, scope, sort]);

	useInput((input, key) => {
		if (key.escape) return onClose();
		if (key.return) {
			const selected = visible[index];
			if (selected) onInsert(selected.commandText);
			return;
		}
		if (key.upArrow || input === "k") {
			setIndex((value) => Math.max(0, value - 1));
			return;
		}
		if (key.downArrow || input === "j") {
			setIndex((value) => Math.min(Math.max(0, visible.length - 1), value + 1));
			return;
		}
		if (input === "\t") {
			setScope((value) =>
				value === "merged" ? "session" : value === "session" ? "all" : "merged",
			);
			setIndex(0);
			return;
		}
		if (input === "s") {
			setSort((value) =>
				value === "score"
					? "recent"
					: value === "recent"
						? "frequency"
						: "score",
			);
			setIndex(0);
			return;
		}
		if (input === "/") {
			setFilter("");
			return;
		}
		if (key.backspace || key.delete) {
			setFilter((value) => value.slice(0, -1));
			return;
		}
		if (input && input.length === 1 && input >= " " && !key.ctrl && !key.meta)
			setFilter((value) => value + input.toLocaleLowerCase());
	});

	return (
		<Box
			borderStyle="single"
			borderColor="cyan"
			width="100%"
			flexDirection="column"
			paddingX={1}
		>
			<Text bold color="cyan">
				{t("history.title")}
			</Text>
			<Text>
				{t("history.scope", { value: t(`history.scope.${scope}`) })}{" "}
				{t("history.sort", { value: t(`history.sort.${sort}`) })}{" "}
				{t("history.filter", { value: filter })}
			</Text>
			{scope === "merged" ? (
				<Text
					dimColor
				>{`${truncate(t("history.column.command"), commandWidth)}  ${t("history.column.session").padStart(7)}  ${t("history.column.all").padStart(5)}  ${t("history.column.lastUsed").padEnd(12)}  ${t("history.column.source")}`}</Text>
			) : (
				<Text
					dimColor
				>{`${truncate(t("history.column.command"), commandWidth)}  ${t("history.column.uses").padStart(5)}  ${t("history.column.lastUsed").padEnd(12)}  ${t(`history.scope.${scope}`)}`}</Text>
			)}
			{visible.length === 0 && (
				<Text>{filter ? t("history.noMatches") : t("history.empty")}</Text>
			)}
			{visible.map((candidate, rowIndex) => {
				const candidateScope =
					candidate.sessionCount > 0 && candidate.allCount > 0
						? "merged"
						: candidate.sessionCount > 0
							? "session"
							: "all";
				return (
					<Text key={candidate.commandText} inverse={rowIndex === index}>
						{rowIndex === index ? "▸ " : "  "}
						{scope === "merged"
							? `${truncate(candidate.commandText, commandWidth)}  ${String(candidate.sessionCount).padStart(7)}  ${String(candidate.allCount).padStart(5)}  ${lastUsed(candidate).padEnd(12)}  ${t(`history.scope.${candidateScope}`)}`
							: `${truncate(candidate.commandText, commandWidth)}  ${String(scope === "session" ? candidate.sessionCount : candidate.allCount).padStart(5)}  ${lastUsed(candidate).padEnd(12)}  ${t(`history.scope.${scope}`)}`}
					</Text>
				);
			})}
			{visible[index] && (
				<Text dimColor>
					{t("history.selected", { value: visible[index]!.commandText })}
				</Text>
			)}
			<Text dimColor>{t("history.hints")}</Text>
		</Box>
	);
}
