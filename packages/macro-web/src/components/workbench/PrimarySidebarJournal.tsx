import type {
	EditorOutputEntryDto,
	GatedActionDescriptorDto,
	MacroArtifactDescriptorDto,
} from "@stateful-mcp/macro-protocol";
import { useState } from "react";
import { JournalEmptyState } from "./journal/JournalEmptyState";
import { JournalEntryCard } from "./journal/JournalEntryCard";
import { JournalToolbar } from "./journal/JournalToolbar";
import type { DensityMode } from "./journal/journal-types";
import { useJournalFilters } from "./journal/useJournalFilters";
import type { SidebarPaneProps } from "./primary-sidebar-types";

export function JournalPaneBody({ props, helpers }: SidebarPaneProps) {
	const { t } = helpers;
	const { snapshot, onCommand, onJumpToLine } = props;

	const rawEntries = snapshot?.editor?.output?.entries ?? [];
	const {
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
	} = useJournalFilters(rawEntries);

	const [density, setDensity] = useState<DensityMode>("compact");
	const [filtersExpanded, setFiltersExpanded] = useState(false);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

	const handleRevert = (entry: EditorOutputEntryDto) => {
		if (onCommand) {
			onCommand("journal.reverseEntry", [entry.outputId]);
		}
	};

	const handleSaveArtifact = (artifact: MacroArtifactDescriptorDto) => {
		if (onCommand) {
			if (artifact.artifactToken && artifact.capabilities?.includes("save"))
				onCommand("editor.saveArtifact", [artifact.artifactToken]);
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
				setSelectedId(
					selectedId === current.outputId ? null : current.outputId,
				);
			}
		} else if (e.key === "Escape") {
			setSelectedId(null);
		}
	};

	const toggleSelected = (outputId: string) =>
		setSelectedId(selectedId === outputId ? null : outputId);

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
				onToggleSort={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
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
							onSelect={() => toggleSelected(entry.outputId)}
							onKeyDown={(e) => handleKeyDown(e, idx)}
							onCopy={handleCopy}
							onReplay={() => handleReplay(entry)}
							onRevert={() => handleRevert(entry)}
							onInsertFacet={(text) => {
								if (onCommand) {
									onCommand("editor.insertText", [text]);
								}
							}}
							onSaveArtifact={handleSaveArtifact}
							onTriggerAction={handleTriggerAction}
						/>
					))}
				</div>
			)}
		</div>
	);
}
