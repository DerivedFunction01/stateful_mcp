import type { EditorOutputEntryDto } from "@stateful-mcp/macro-protocol";
import { useMemo, useState } from "react";
import type { SortDirection, StatusFilter, TimeFilter } from "./journal-types";

export type JournalFilterState = {
	readonly searchQuery: string;
	readonly statusFilter: StatusFilter;
	readonly timeFilter: TimeFilter;
	readonly customFrom: string;
	readonly customTo: string;
	readonly macroFilter: string;
	readonly sortOrder: SortDirection;
};

export type UseJournalFilters = JournalFilterState & {
	readonly filteredEntries: readonly EditorOutputEntryDto[];
	readonly distinctMacros: readonly string[];
	readonly setSearchQuery: (q: string) => void;
	readonly setStatusFilter: (s: StatusFilter) => void;
	readonly setTimeFilter: (tf: TimeFilter) => void;
	readonly setCustomFrom: (d: string) => void;
	readonly setCustomTo: (d: string) => void;
	readonly setMacroFilter: (m: string) => void;
	readonly setSortOrder: (s: SortDirection) => void;
};

export function filterJournalEntries(
	entries: readonly EditorOutputEntryDto[],
	filters: JournalFilterState,
): readonly EditorOutputEntryDto[] {
	const dayMs = 24 * 60 * 60 * 1000;
	const now = Date.now();
	const q = filters.searchQuery.toLowerCase().trim();

	return entries
		.filter((entry) => {
			if (filters.statusFilter !== "all") {
				if (
					filters.statusFilter === "committed" &&
					entry.status !== "committed"
				)
					return false;
				if (filters.statusFilter === "reversed" && entry.status !== "reversed")
					return false;
				if (filters.statusFilter === "failed" && entry.status !== "failed")
					return false;
			}

			if (filters.timeFilter === "today") {
				const todayStart = new Date().setHours(0, 0, 0, 0);
				if (entry.executedAt < todayStart) return false;
			} else if (filters.timeFilter === "last24h") {
				if (now - entry.executedAt > dayMs) return false;
			} else if (filters.timeFilter === "last7d") {
				if (now - entry.executedAt > 7 * dayMs) return false;
			} else if (filters.timeFilter === "custom") {
				if (filters.customFrom) {
					const fromMs = new Date(filters.customFrom).setHours(0, 0, 0, 0);
					if (entry.executedAt < fromMs) return false;
				}
				if (filters.customTo) {
					const toMs = new Date(filters.customTo).setHours(23, 59, 59, 999);
					if (entry.executedAt > toMs) return false;
				}
			}

			if (
				filters.macroFilter !== "all" &&
				entry.macroId !== filters.macroFilter
			) {
				return false;
			}

			if (q) {
				const matchMacro = entry.macroId?.toLowerCase().includes(q);
				const matchInvoked = entry.invokedAs?.toLowerCase().includes(q);
				const matchRaw = entry.rawText?.toLowerCase().includes(q);
				const matchId = entry.outputId?.toLowerCase().includes(q);
				const matchFp = entry.fingerprint?.toLowerCase().includes(q);
				const matchReversal = entry.reversalReason?.toLowerCase().includes(q);
				if (
					!matchMacro &&
					!matchInvoked &&
					!matchRaw &&
					!matchId &&
					!matchFp &&
					!matchReversal
				) {
					return false;
				}
			}

			return true;
		})
		.sort((a, b) => {
			return filters.sortOrder === "asc"
				? a.executedAt - b.executedAt
				: b.executedAt - a.executedAt;
		});
}

export function useJournalFilters(
	entries: readonly EditorOutputEntryDto[],
): UseJournalFilters {
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
	const [customFrom, setCustomFrom] = useState("");
	const [customTo, setCustomTo] = useState("");
	const [macroFilter, setMacroFilter] = useState<string>("all");
	const [sortOrder, setSortOrder] = useState<SortDirection>("desc");

	const distinctMacros = useMemo(() => {
		const set = new Set<string>();
		for (const e of entries) {
			if (e.macroId) set.add(e.macroId);
		}
		return Array.from(set).sort();
	}, [entries]);

	const filteredEntries = useMemo(
		() =>
			filterJournalEntries(entries, {
				searchQuery,
				statusFilter,
				timeFilter,
				customFrom,
				customTo,
				macroFilter,
				sortOrder,
			}),
		[
			entries,
			searchQuery,
			statusFilter,
			timeFilter,
			customFrom,
			customTo,
			macroFilter,
			sortOrder,
		],
	);

	return {
		searchQuery,
		statusFilter,
		timeFilter,
		customFrom,
		customTo,
		macroFilter,
		sortOrder,
		distinctMacros,
		filteredEntries,
		setSearchQuery,
		setStatusFilter,
		setTimeFilter,
		setCustomFrom,
		setCustomTo,
		setMacroFilter,
		setSortOrder,
	};
}
