import { ArrowDownUp, Filter, List, ListFilter, Search, X } from "lucide-react";
import { Badge, IconButton } from "../../ui/primitives";
import type {
	DensityMode,
	I18nFn,
	SortDirection,
	StatusFilter,
	TimeFilter,
} from "./journal-types";

export type JournalToolbarProps = {
	readonly t: I18nFn;
	readonly totalCount: number;
	readonly filteredCount: number;
	readonly density: DensityMode;
	readonly sortOrder: SortDirection;
	readonly filtersExpanded: boolean;
	readonly searchQuery: string;
	readonly statusFilter: StatusFilter;
	readonly timeFilter: TimeFilter;
	readonly customFrom: string;
	readonly customTo: string;
	readonly macroFilter: string;
	readonly distinctMacros: readonly string[];
	readonly onToggleDensity: () => void;
	readonly onToggleSort: () => void;
	readonly onToggleFilters: () => void;
	readonly onSearchChange: (q: string) => void;
	readonly onStatusChange: (s: StatusFilter) => void;
	readonly onTimeChange: (tf: TimeFilter) => void;
	readonly onCustomFromChange: (d: string) => void;
	readonly onCustomToChange: (d: string) => void;
	readonly onMacroChange: (m: string) => void;
};

export function JournalToolbar({
	t,
	totalCount,
	filteredCount,
	density,
	sortOrder,
	filtersExpanded,
	searchQuery,
	statusFilter,
	timeFilter,
	customFrom,
	customTo,
	macroFilter,
	distinctMacros,
	onToggleDensity,
	onToggleSort,
	onToggleFilters,
	onSearchChange,
	onStatusChange,
	onTimeChange,
	onCustomFromChange,
	onCustomToChange,
	onMacroChange,
}: JournalToolbarProps) {
	return (
		<div className="journal-toolbar">
			<div className="journal-toolbar-top">
				<div className="journal-count-badge">
					<Badge tone="neutral">
						{filteredCount} / {totalCount}
					</Badge>
				</div>
				<div className="journal-toolbar-actions">
					<IconButton
						label={
							density === "compact"
								? t("journal.density.detailed")
								: t("journal.density.compact")
						}
						title={
							density === "compact"
								? t("journal.density.detailed")
								: t("journal.density.compact")
						}
						onClick={onToggleDensity}
					>
						{density === "compact" ? (
							<List size={14} />
						) : (
							<ListFilter size={14} />
						)}
					</IconButton>
					<IconButton
						label={
							sortOrder === "desc"
								? t("journal.sort.oldest")
								: t("journal.sort.newest")
						}
						title={
							sortOrder === "desc"
								? t("journal.sort.oldest")
								: t("journal.sort.newest")
						}
						onClick={onToggleSort}
					>
						<ArrowDownUp size={14} />
					</IconButton>
					<IconButton
						label={t("journal.toolbar.toggleFilters")}
						title={t("journal.toolbar.toggleFilters")}
						className={filtersExpanded ? "active" : ""}
						onClick={onToggleFilters}
					>
						<Filter size={14} />
					</IconButton>
				</div>
			</div>

			<div className="journal-search-row">
				<div className="journal-search-input-wrap">
					<Search size={14} className="journal-search-icon" />
					<input
						type="text"
						className="journal-search-input"
						placeholder={t("journal.filter.placeholder")}
						value={searchQuery}
						onChange={(e) => onSearchChange(e.target.value)}
					/>
					{searchQuery && (
						<button
							type="button"
							className="journal-search-clear"
							onClick={() => onSearchChange("")}
						>
							<X size={12} />
						</button>
					)}
				</div>
			</div>

			{filtersExpanded && (
				<div className="journal-filter-ribbon">
					<div className="journal-status-chips">
						{(["all", "committed", "reversed", "failed"] as StatusFilter[]).map(
							(s) => (
								<button
									key={s}
									type="button"
									className={`journal-status-chip chip-${s} ${statusFilter === s ? "active" : ""}`}
									onClick={() => onStatusChange(s)}
								>
									{t(`journal.filter.${s}`)}
								</button>
							),
						)}
					</div>

					<div className="journal-dropdown-row">
						<select
							className="journal-select"
							value={timeFilter}
							onChange={(e) => onTimeChange(e.target.value as TimeFilter)}
						>
							<option value="all">{t("journal.filter.time.all")}</option>
							<option value="today">{t("journal.filter.time.today")}</option>
							<option value="last24h">
								{t("journal.filter.time.last24h")}
							</option>
							<option value="last7d">{t("journal.filter.time.last7d")}</option>
							<option value="custom">{t("journal.filter.time.custom")}</option>
						</select>

						{distinctMacros.length > 0 && (
							<select
								className="journal-select"
								value={macroFilter}
								onChange={(e) => onMacroChange(e.target.value)}
							>
								<option value="all">{t("journal.filter.macro.all")}</option>
								{distinctMacros.map((m) => (
									<option key={m} value={m}>
										{m}
									</option>
								))}
							</select>
						)}
					</div>

					{timeFilter === "custom" && (
						<div className="journal-custom-date-row">
							<div className="journal-date-field">
								<span className="journal-date-label">
									{t("journal.filter.date.from")}
								</span>
								<input
									type="date"
									className="journal-date-input"
									value={customFrom}
									onChange={(e) => onCustomFromChange(e.target.value)}
								/>
							</div>
							<div className="journal-date-field">
								<span className="journal-date-label">
									{t("journal.filter.date.to")}
								</span>
								<input
									type="date"
									className="journal-date-input"
									value={customTo}
									onChange={(e) => onCustomToChange(e.target.value)}
								/>
							</div>
							{(customFrom || customTo) && (
								<button
									type="button"
									className="journal-date-clear"
									title={t("journal.filter.date.clear")}
									onClick={() => {
										onCustomFromChange("");
										onCustomToChange("");
									}}
								>
									<X size={12} />
								</button>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
