import type {
	EditorOutputEntryDto,
	GatedActionDescriptorDto,
	MacroArtifactDescriptorDto,
	MacroDisplayFacetsDto,
	MacroExecutionPayloadDto,
} from "@stateful-mcp/macro-protocol";
import {
	AlertCircle,
	ArrowDownUp,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Copy,
	CornerDownLeft,
	Database,
	Download,
	ExternalLink,
	FileCode2,
	FileSpreadsheet,
	FileText,
	Filter,
	FolderPlus,
	History,
	List,
	ListFilter,
	Play,
	RotateCcw,
	Search,
	X,
	XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { useI18n } from "../../lib/macro-i18n-provider";
import { Badge, IconButton } from "../ui/primitives";
import type { SidebarPaneProps } from "./primary-sidebar-types";

type I18nFn = ReturnType<typeof useI18n>["t"];
type StatusFilter = "all" | "committed" | "reversed" | "failed";
type TimeFilter = "all" | "today" | "last24h" | "last7d" | "custom";
type DensityMode = "compact" | "detailed";
type SortDirection = "desc" | "asc";

export function JournalPaneBody({ props, helpers }: SidebarPaneProps) {
	const { t } = helpers;
	const { snapshot, onCommand, onJumpToLine } = props;

	const rawEntries = useMemo(
		() => snapshot?.editor?.output?.entries ?? [],
		[snapshot?.editor?.output?.entries],
	);

	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
	const [customFrom, setCustomFrom] = useState("");
	const [customTo, setCustomTo] = useState("");
	const [macroFilter, setMacroFilter] = useState<string>("all");
	const [density, setDensity] = useState<DensityMode>("compact");
	const [sortOrder, setSortOrder] = useState<SortDirection>("desc");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [copiedKey, setCopiedKey] = useState<string | null>(null);
	const [filtersExpanded, setFiltersExpanded] = useState(false);

	const distinctMacros = useMemo(() => {
		const set = new Set<string>();
		for (const e of rawEntries) {
			if (e.macroId) set.add(e.macroId);
		}
		return Array.from(set).sort();
	}, [rawEntries]);

	const filteredEntries = useMemo(() => {
		const now = Date.now();
		const dayMs = 24 * 60 * 60 * 1000;

		return rawEntries
			.filter((entry) => {
				if (statusFilter !== "all") {
					if (statusFilter === "committed" && entry.status !== "committed")
						return false;
					if (statusFilter === "reversed" && entry.status !== "reversed")
						return false;
					if (statusFilter === "failed" && entry.status !== "failed")
						return false;
				}

				if (timeFilter === "today") {
					const todayStart = new Date().setHours(0, 0, 0, 0);
					if (entry.executedAt < todayStart) return false;
				} else if (timeFilter === "last24h") {
					if (now - entry.executedAt > dayMs) return false;
				} else if (timeFilter === "last7d") {
					if (now - entry.executedAt > 7 * dayMs) return false;
				} else if (timeFilter === "custom") {
					if (customFrom) {
						const fromMs = new Date(customFrom).setHours(0, 0, 0, 0);
						if (entry.executedAt < fromMs) return false;
					}
					if (customTo) {
						const toMs = new Date(customTo).setHours(23, 59, 59, 999);
						if (entry.executedAt > toMs) return false;
					}
				}

				if (macroFilter !== "all" && entry.macroId !== macroFilter) {
					return false;
				}

				if (searchQuery.trim()) {
					const q = searchQuery.toLowerCase().trim();
					const matchMacro = entry.macroId?.toLowerCase().includes(q);
					const matchInvoked = entry.invokedAs?.toLowerCase().includes(q);
					const matchRaw = entry.rawText?.toLowerCase().includes(q);
					const matchId = entry.outputId?.toLowerCase().includes(q);
					const matchFp = entry.fingerprint?.toLowerCase().includes(q);
					const matchReversal = entry.reversalReason
						?.toLowerCase()
						.includes(q);
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
				return sortOrder === "asc"
					? a.executedAt - b.executedAt
					: b.executedAt - a.executedAt;
			});
	}, [
		rawEntries,
		statusFilter,
		timeFilter,
		customFrom,
		customTo,
		macroFilter,
		searchQuery,
		sortOrder,
	]);

	const handleCopy = (text: string, key: string) => {
		navigator.clipboard?.writeText(text);
		setCopiedKey(key);
		setTimeout(() => setCopiedKey(null), 1800);
	};

	const handleReplay = (entry: EditorOutputEntryDto) => {
		if (entry.lineNumber !== undefined) {
			onJumpToLine?.(entry.lineNumber);
		}
		if (entry.rawText && onCommand) {
			onCommand("editor.insertText", [entry.rawText]);
		}
	};

	const handleInsertFacet = (text: string) => {
		if (onCommand) {
			onCommand("editor.insertText", [text]);
		}
	};

	const handleRevert = (entry: EditorOutputEntryDto) => {
		if (onCommand) {
			onCommand("journal.reverseEntry", [entry.outputId]);
		}
	};

	const handleSaveArtifact = (artifact: MacroArtifactDescriptorDto) => {
		if (onCommand) {
			onCommand("workbench.saveArtifact", [artifact.id, artifact.name]);
		}
	};

	const handleTriggerAction = (action: GatedActionDescriptorDto) => {
		if (onCommand) {
			onCommand("workbench.executeGatedAction", [
				action.actionId,
				action.referenceId,
			]);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = filteredEntries[index + 1];
			if (next) setSelectedId(next.outputId);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			const prev = filteredEntries[index - 1];
			if (prev) setSelectedId(prev.outputId);
		} else if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			const current = filteredEntries[index];
			if (current) {
				setSelectedId(selectedId === current.outputId ? null : current.outputId);
			}
		} else if (e.key === "Escape") {
			setSelectedId(null);
		}
	};

	return (
		<div className="sidebar-journal-container">
			<JournalToolbar
				t={t}
				totalCount={rawEntries.length}
				filteredCount={filteredEntries.length}
				density={density}
				sortOrder={sortOrder}
				filtersExpanded={filtersExpanded}
				searchQuery={searchQuery}
				statusFilter={statusFilter}
				timeFilter={timeFilter}
				customFrom={customFrom}
				customTo={customTo}
				macroFilter={macroFilter}
				distinctMacros={distinctMacros}
				onToggleDensity={() =>
					setDensity(density === "compact" ? "detailed" : "compact")
				}
				onToggleSort={() =>
					setSortOrder(sortOrder === "desc" ? "asc" : "desc")
				}
				onToggleFilters={() => setFiltersExpanded(!filtersExpanded)}
				onSearchChange={setSearchQuery}
				onStatusChange={setStatusFilter}
				onTimeChange={setTimeFilter}
				onCustomFromChange={setCustomFrom}
				onCustomToChange={setCustomTo}
				onMacroChange={setMacroFilter}
			/>

			{filteredEntries.length === 0 ? (
				<JournalEmptyState t={t} />
			) : (
				<div className="journal-entries-list" role="list">
					{filteredEntries.map((entry, idx) => (
						<JournalEntryCard
							key={entry.outputId}
							entry={entry}
							idx={idx}
							density={density}
							isSelected={selectedId === entry.outputId}
							copiedKey={copiedKey}
							t={t}
							onSelect={() =>
								setSelectedId(
									selectedId === entry.outputId ? null : entry.outputId,
								)
							}
							onKeyDown={(e) => handleKeyDown(e, idx)}
							onCopy={handleCopy}
							onReplay={() => handleReplay(entry)}
							onRevert={() => handleRevert(entry)}
							onInsertFacet={handleInsertFacet}
							onSaveArtifact={handleSaveArtifact}
							onTriggerAction={handleTriggerAction}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Declarative Subcomponents
// ---------------------------------------------------------------------------

function JournalToolbar({
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
}: {
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
}) {
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
						{density === "compact" ? <List size={14} /> : <ListFilter size={14} />}
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
						label="Toggle Filter Ribbon"
						title="Toggle Filter Ribbon"
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
							<option value="last24h">{t("journal.filter.time.last24h")}</option>
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
									title="Clear date range"
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

function JournalEmptyState({
	t,
}: { readonly t: I18nFn }) {
	return (
		<div className="journal-empty-state">
			<History size={32} className="journal-empty-icon" />
			<h4 className="journal-empty-title">{t("journal.empty")}</h4>
			<p className="journal-empty-description">
				{t("journal.empty.description")}
			</p>
		</div>
	);
}

function JournalEntryCard({
	entry,
	idx,
	density,
	isSelected,
	copiedKey,
	t,
	onSelect,
	onKeyDown,
	onCopy,
	onReplay,
	onRevert,
	onInsertFacet,
	onSaveArtifact,
	onTriggerAction,
}: {
	readonly entry: EditorOutputEntryDto;
	readonly idx: number;
	readonly density: DensityMode;
	readonly isSelected: boolean;
	readonly copiedKey: string | null;
	readonly t: I18nFn;
	readonly onSelect: () => void;
	readonly onKeyDown: (e: React.KeyboardEvent) => void;
	readonly onCopy: (text: string, key: string) => void;
	readonly onReplay: () => void;
	readonly onRevert: () => void;
	readonly onInsertFacet: (text: string) => void;
	readonly onSaveArtifact: (artifact: MacroArtifactDescriptorDto) => void;
	readonly onTriggerAction: (action: GatedActionDescriptorDto) => void;
}) {
	const shortHash = entry.fingerprint
		? entry.fingerprint.slice(0, 6)
		: entry.outputId.slice(-6);

	const formattedTime = new Date(entry.executedAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	const payload = (
		entry.result && typeof entry.result === "object" && "data" in entry.result
			? (entry.result as any).data
			: entry.result
	) as MacroExecutionPayloadDto | Record<string, unknown> | undefined;

	const facets: MacroDisplayFacetsDto | undefined =
		payload && typeof payload === "object" && "facets" in payload
			? (payload as MacroExecutionPayloadDto).facets
			: undefined;

	const artifacts: readonly MacroArtifactDescriptorDto[] | undefined =
		payload && typeof payload === "object" && "artifacts" in payload
			? (payload as MacroExecutionPayloadDto).artifacts
			: undefined;

	const gatedActions: readonly GatedActionDescriptorDto[] | undefined =
		payload && typeof payload === "object" && "gatedActions" in payload
			? (payload as MacroExecutionPayloadDto).gatedActions
			: undefined;

	return (
		<div
			role="listitem"
			tabIndex={0}
			className={`journal-entry-card ${density} ${isSelected ? "selected" : ""} status-${entry.status}`}
			onClick={onSelect}
			onKeyDown={onKeyDown}
		>
			<div className="journal-entry-header">
				<div className="journal-entry-status-node">
					{entry.status === "committed" && (
						<span title={t("journal.filter.committed")}>
							<CheckCircle2
								size={13}
								className="status-glyph committed"
							/>
						</span>
					)}
					{entry.status === "reversed" && (
						<span title={t("journal.filter.reversed")}>
							<RotateCcw
								size={13}
								className="status-glyph reversed"
							/>
						</span>
					)}
					{entry.status === "failed" && (
						<span title={t("journal.filter.failed")}>
							<XCircle
								size={13}
								className="status-glyph failed"
							/>
						</span>
					)}
				</div>

				<span className="journal-entry-hash">#{shortHash}</span>

				<div className="journal-entry-macro-group">
					<strong className="journal-entry-macro">
						{entry.macroId || t("journal.entry.unnamed")}
					</strong>
					{entry.invokedAs && (
						<span className="journal-entry-trigger">
							({t("journal.entry.via", { trigger: entry.invokedAs })})
						</span>
					)}
				</div>

				{entry.lineNumber !== undefined && (
					<span className="journal-entry-line">L{entry.lineNumber}</span>
				)}

				<span className="journal-entry-time">{formattedTime}</span>

				<div className="journal-entry-chevron">
					{isSelected ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
				</div>
			</div>

			{density === "detailed" && !isSelected && (
				<div className="journal-entry-body-preview">
					{entry.rawText && (
						<code className="journal-raw-preview">{entry.rawText}</code>
					)}
					{entry.reversalReason && (
						<div className="journal-reversal-badge">
							<RotateCcw size={11} />
							<span>{entry.reversalReason}</span>
						</div>
					)}
				</div>
			)}

			{isSelected && (
				<div
					className="journal-entry-inspector"
					onClick={(e) => e.stopPropagation()}
				>
					{entry.rawText && (
						<div className="inspector-section">
							<div className="inspector-section-header">
								<span className="inspector-label">
									{t("journal.entry.line", {
										line: String(entry.lineNumber ?? 1),
									})}
								</span>
								<button
									type="button"
									className="inspector-mini-btn"
									title={t("journal.action.copyRaw")}
									onClick={() =>
										onCopy(entry.rawText!, `${entry.outputId}:raw`)
									}
								>
									{copiedKey === `${entry.outputId}:raw` ? (
										<Check size={11} />
									) : (
										<Copy size={11} />
									)}
								</button>
							</div>
							<code className="inspector-raw-text">{entry.rawText}</code>
						</div>
					)}

					{entry.reversalReason && (
						<div className="inspector-section reversal-alert">
							<AlertCircle size={14} />
							<span>
								{t("journal.entry.reversalReason", {
									reason: entry.reversalReason,
								})}
							</span>
						</div>
					)}

					{/* Multi-Facet Output View */}
					{facets ? (
						<JournalFacetStack
							entryId={entry.outputId}
							facets={facets}
							copiedKey={copiedKey}
							t={t}
							onCopy={onCopy}
							onInsertFacet={onInsertFacet}
						/>
					) : entry.result ? (
						<div className="inspector-section">
							<div className="inspector-section-header">
								<span className="inspector-label">
									{t("journal.facet.data")}
								</span>
								<button
									type="button"
									className="inspector-mini-btn"
									title={t("journal.action.copyJson")}
									onClick={() =>
										onCopy(
											JSON.stringify(entry.result, null, 2),
											`${entry.outputId}:json`,
										)
									}
								>
									{copiedKey === `${entry.outputId}:json` ? (
										<Check size={11} />
									) : (
										<Copy size={11} />
									)}
								</button>
							</div>
							<pre className="inspector-json-block">
								{JSON.stringify(entry.result, null, 2)}
							</pre>
						</div>
					) : null}

					{/* Generated File Artifacts */}
					{artifacts && artifacts.length > 0 && (
						<JournalArtifactList
							artifacts={artifacts}
							t={t}
							onSaveArtifact={onSaveArtifact}
						/>
					)}

					{/* Gated / Deferred Actions */}
					{gatedActions && gatedActions.length > 0 && (
						<JournalGatedActionList
							actions={gatedActions}
							t={t}
							onTriggerAction={onTriggerAction}
						/>
					)}

					{entry.fingerprint && (
						<div className="inspector-fingerprint-row">
							<span className="inspector-label">
								{t("journal.entry.fingerprint")}
							</span>
							<code
								className="inspector-fingerprint"
								title={entry.fingerprint}
							>
								{entry.fingerprint}
							</code>
						</div>
					)}

					<div className="inspector-actions">
						<button
							type="button"
							className="inspector-action-btn primary"
							onClick={onReplay}
							title={t("journal.action.replay")}
						>
							<CornerDownLeft size={13} />
							<span>{t("journal.action.replay")}</span>
						</button>

						{entry.status === "committed" && (
							<button
								type="button"
								className="inspector-action-btn danger"
								onClick={onRevert}
								title={t("journal.action.revert")}
							>
								<RotateCcw size={13} />
								<span>{t("journal.action.revert")}</span>
							</button>
						)}

						<button
							type="button"
							className="inspector-action-btn secondary"
							onClick={() =>
								onCopy(
									JSON.stringify(entry, null, 2),
									`${entry.outputId}:receipt`,
								)
							}
							title={t("journal.action.copy")}
						>
							{copiedKey === `${entry.outputId}:receipt` ? (
								<Check size={13} className="copied-icon" />
							) : (
								<Copy size={13} />
							)}
							<span>
								{copiedKey === `${entry.outputId}:receipt`
									? t("journal.action.copied")
									: t("journal.action.copy")}
							</span>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function JournalFacetStack({
	entryId,
	facets,
	copiedKey,
	t,
	onCopy,
	onInsertFacet,
}: {
	readonly entryId: string;
	readonly facets: MacroDisplayFacetsDto;
	readonly copiedKey: string | null;
	readonly t: I18nFn;
	readonly onCopy: (text: string, key: string) => void;
	readonly onInsertFacet: (text: string) => void;
}) {
	return (
		<div className="journal-facet-stack">
			{facets.text && (
				<div className="inspector-section">
					<div className="inspector-section-header">
						<span className="inspector-label">{t("journal.facet.text")}</span>
						<div className="inspector-section-actions">
							<button
								type="button"
								className="inspector-mini-btn"
								title={t("journal.action.replay")}
								onClick={() => onInsertFacet(facets.text!)}
							>
								<CornerDownLeft size={11} />
							</button>
							<button
								type="button"
								className="inspector-mini-btn"
								title={t("journal.action.copyText")}
								onClick={() => onCopy(facets.text!, `${entryId}:prose`)}
							>
								{copiedKey === `${entryId}:prose` ? (
									<Check size={11} />
								) : (
									<Copy size={11} />
								)}
							</button>
						</div>
					</div>
					<div className="inspector-prose-block">{facets.text}</div>
				</div>
			)}

			{facets.data && (
				<div className="inspector-section">
					<div className="inspector-section-header">
						<span className="inspector-label">{t("journal.facet.data")}</span>
						<button
							type="button"
							className="inspector-mini-btn"
							title={t("journal.action.copyJson")}
							onClick={() =>
								onCopy(
									JSON.stringify(facets.data, null, 2),
									`${entryId}:facet_json`,
								)
							}
						>
							{copiedKey === `${entryId}:facet_json` ? (
								<Check size={11} />
							) : (
								<Copy size={11} />
							)}
						</button>
					</div>
					<pre className="inspector-json-block">
						{JSON.stringify(facets.data, null, 2)}
					</pre>
				</div>
			)}

			{facets.table && (
				<div className="inspector-section">
					<span className="inspector-label">{t("journal.facet.table")}</span>
					<div className="inspector-table-wrap">
						<table className="inspector-table">
							<thead>
								<tr>
									{facets.table.headers.map((h, i) => (
										<th key={`${h}_${i}`}>{h}</th>
									))}
								</tr>
							</thead>
							<tbody>
								{facets.table.rows.map((row, ri) => (
									<tr key={`row_${ri}`}>
										{row.map((cell, ci) => (
											<td key={`cell_${ri}_${ci}`}>{String(cell ?? "")}</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	);
}

function JournalArtifactList({
	artifacts,
	t,
	onSaveArtifact,
}: {
	readonly artifacts: readonly MacroArtifactDescriptorDto[];
	readonly t: I18nFn;
	readonly onSaveArtifact: (a: MacroArtifactDescriptorDto) => void;
}) {
	return (
		<div className="inspector-section">
			<span className="inspector-label">{t("journal.artifact.title")}</span>
			<div className="journal-artifact-list">
				{artifacts.map((a) => {
					const isTable =
						a.name.endsWith(".csv") ||
						a.name.endsWith(".parquet") ||
						a.name.endsWith(".xlsx");
					const isCode =
						a.name.endsWith(".json") ||
						a.name.endsWith(".ts") ||
						a.name.endsWith(".sql");

					return (
						<div key={a.id} className="journal-artifact-card">
							<div className="journal-artifact-info">
								{isTable ? (
									<FileSpreadsheet size={14} className="artifact-icon" />
								) : isCode ? (
									<FileCode2 size={14} className="artifact-icon" />
								) : (
									<FileText size={14} className="artifact-icon" />
								)}
								<div className="artifact-name-group">
									<strong className="artifact-name">{a.name}</strong>
									{a.sizeBytes !== undefined && (
										<span className="artifact-size">
											({formatBytes(a.sizeBytes)})
										</span>
									)}
								</div>
							</div>
							<div className="artifact-card-actions">
								<button
									type="button"
									className="artifact-btn"
									title={t("journal.artifact.save")}
									onClick={() => onSaveArtifact(a)}
								>
									<FolderPlus size={12} />
									<span>{t("journal.artifact.save")}</span>
								</button>
								{a.downloadUrl && (
									<a
										href={a.downloadUrl}
										download={a.name}
										className="artifact-btn"
										title={t("journal.artifact.download")}
									>
										<Download size={12} />
									</a>
								)}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function JournalGatedActionList({
	actions,
	t,
	onTriggerAction,
}: {
	readonly actions: readonly GatedActionDescriptorDto[];
	readonly t: I18nFn;
	readonly onTriggerAction: (a: GatedActionDescriptorDto) => void;
}) {
	return (
		<div className="inspector-section">
			<span className="inspector-label">{t("journal.gated.title")}</span>
			<div className="journal-gated-list">
				{actions.map((act) => (
					<button
						key={act.actionId}
						type="button"
						className="journal-gated-btn"
						onClick={() => onTriggerAction(act)}
					>
						{act.kind === "download" ? (
							<Download size={13} />
						) : act.kind === "external" ? (
							<ExternalLink size={13} />
						) : (
							<Play size={13} />
						)}
						<span>{act.label}</span>
					</button>
				))}
			</div>
		</div>
	);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
