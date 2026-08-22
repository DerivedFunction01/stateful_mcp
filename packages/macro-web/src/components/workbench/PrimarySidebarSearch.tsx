import {
	ChevronDown,
	ChevronRight,
	ExternalLink,
	FileText,
	Replace,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	unescapeReplacementString,
	unescapeSearchPattern,
} from "../../lib/search-utils";
import { SearchReplaceBar, type SearchOptions } from "../SearchReplaceBar";
import type { SidebarPaneProps } from "./primary-sidebar-types";

interface SearchMatchItem {
	readonly lineNumber: number;
	readonly startOffset: number;
	readonly endOffset: number;
	readonly prefix: string;
	readonly matchText: string;
	readonly suffix: string;
}

interface FileSearchResult {
	readonly documentId: string;
	readonly title: string;
	readonly matches: readonly SearchMatchItem[];
}

export function SearchPaneBody({ props, helpers }: SidebarPaneProps) {
	const {
		searchQuery,
		setSearchQuery,
		searchReplace,
		setSearchReplace,
		matchCase,
		setMatchCase,
		wholeWord,
		setWholeWord,
		isRegex,
		setIsRegex,
		replaceOpen,
		setReplaceOpen,
		collapsedFiles,
		toggleFileCollapsed,
		t,
	} = helpers;

	const {
		snapshot,
		documents = [],
		activeDocumentLines,
		onSelectDocument,
		onJumpToLine,
		onReplace,
		onReplaceAll,
	} = props;

	const [dismissedFiles, setDismissedFiles] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [dismissedMatches, setDismissedMatches] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [searchRefresh, setSearchRefresh] = useState(0);
	const [options, setOptions] = useState<SearchOptions>({ matchCase, wholeWord, regex: isRegex });

	const searchResults = useMemo<readonly FileSearchResult[]>(() => {
		const query = unescapeSearchPattern(searchQuery.trim(), isRegex);
		if (!query) return [];

		let matcher: RegExp | null = null;
		try {
			if (isRegex) {
				matcher = new RegExp(query, matchCase ? "g" : "gi");
			} else {
				const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
				const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
				matcher = new RegExp(pattern, matchCase ? "g" : "gi");
			}
		} catch {
			return [];
		}

		const results: FileSearchResult[] = [];

		for (const doc of documents) {
			if (dismissedFiles.has(doc.documentId)) continue;

			const lines: readonly string[] =
				doc.documentId === snapshot?.editor.activeDocument?.documentId
					? (activeDocumentLines ??
						snapshot?.editor.activeDocument?.lines.map((l) => l.rawText) ??
						[])
					: [];

			const fileMatches: SearchMatchItem[] = [];

			lines.forEach((lineText, logicalLineIndex) => {
				matcher!.lastIndex = 0;
				let match = matcher!.exec(lineText);
				while (match !== null) {
					const start = match.index;
					const end = start + match[0].length;
					const matchKey = `${doc.documentId}-${logicalLineIndex + 1}-${start}`;
					if (!dismissedMatches.has(matchKey)) {
						const prefix = lineText.slice(Math.max(0, start - 20), start);
						const matchText = match[0];
						const suffix = lineText.slice(
							end,
							Math.min(lineText.length, end + 30),
						);

						fileMatches.push({
							lineNumber: logicalLineIndex + 1,
							startOffset: start,
							endOffset: end,
							prefix,
							matchText,
							suffix,
						});
					}
					const previousIndex = matcher!.lastIndex;
					match = matcher!.exec(lineText);
					if (match && matcher!.lastIndex === previousIndex)
						matcher!.lastIndex += 1;
				}
			});

			if (fileMatches.length > 0) {
				results.push({
					documentId: doc.documentId,
					title: doc.title,
					matches: fileMatches,
				});
			}
		}

		return results;
	}, [
		searchQuery,
		documents,
		snapshot,
		activeDocumentLines,
		matchCase,
		wholeWord,
		isRegex,
		dismissedFiles,
		dismissedMatches,
		searchRefresh,
	]);

	const totalMatches = searchResults.reduce(
		(sum, r) => sum + r.matches.length,
		0,
	);
	const matchingFilesCount = searchResults.length;
	const searchPattern = unescapeSearchPattern(searchQuery, isRegex);

	const flatMatches = useMemo(() => {
		const items: {
			readonly documentId: string;
			readonly lineNumber: number;
			readonly startOffset: number;
			readonly key: string;
		}[] = [];
		for (const group of searchResults) {
			group.matches.forEach((m, i) => {
				items.push({
					documentId: group.documentId,
					lineNumber: m.lineNumber,
					startOffset: m.startOffset,
					key: `${group.documentId}-${m.lineNumber}-${m.startOffset}-${i}`,
				});
			});
		}
		return items;
	}, [searchResults]);

	const [activeMatchIndex, setActiveMatchIndex] = useState<number>(-1);

	useEffect(() => {
		setActiveMatchIndex((index) =>
			flatMatches.length === 0 ? -1 : Math.min(index, flatMatches.length - 1),
		);
	}, [flatMatches.length]);

	const jumpToMatch = (index: number) => {
		if (flatMatches.length === 0) return;
		const nextIndex = (index + flatMatches.length) % flatMatches.length;
		setActiveMatchIndex(nextIndex);
		const target = flatMatches[nextIndex];
		if (target) {
			onSelectDocument?.(target.documentId);
			onJumpToLine?.(target.lineNumber, target.startOffset);
		}
	};

	const replaceCurrentMatchAndAdvance = () => {
		if (!onReplace || flatMatches.length === 0) return;
		const current = flatMatches[activeMatchIndex >= 0 ? activeMatchIndex : 0];
		if (!current) return;
		onReplace(
			searchPattern,
			unescapeReplacementString(searchReplace),
			current.lineNumber,
			current.startOffset,
		);
		setActiveMatchIndex((index) =>
			flatMatches.length > 1 ? (index + 1) % flatMatches.length : 0,
		);
	};

	const refreshSearchResults = () => {
		setSearchRefresh((refresh) => refresh + 1);
		setActiveMatchIndex(-1);
	};

	return (
		<div className="sidebar-search-container">
			<div className="sidebar-search-header">
				<SearchReplaceBar
					query={searchQuery}
					replacement={searchReplace}
					options={options}
					message={searchQuery ? t("workbench.searchResultsSummary", { count: totalMatches, files: matchingFilesCount }) : ""}
					replaceOpen={replaceOpen}
					onQueryChange={(value) => {
						setSearchQuery(value);
						setActiveMatchIndex(-1);
						setDismissedFiles(new Set());
						setDismissedMatches(new Set());
						props.onSearchQueryChange?.(value);
					}}
					onReplacementChange={setSearchReplace}
					onOptionsChange={(next) => {
						setOptions(next);
						setMatchCase(next.matchCase);
						setWholeWord(next.wholeWord);
						setIsRegex(next.regex);
					}}
					onQuerySubmit={refreshSearchResults}
					onReplacementSubmit={refreshSearchResults}
					onNavigate={(direction) => jumpToMatch(direction === "forward" ? activeMatchIndex + 1 : activeMatchIndex - 1)}
					onReplace={replaceCurrentMatchAndAdvance}
					onReplaceAll={() => onReplaceAll?.(searchPattern, unescapeReplacementString(searchReplace))}
					onToggleReplace={() => setReplaceOpen((open) => !open)}
				/>
				{/* Search results remain below the shared control bar. */}
				<div className="sidebar-search-summary-spacer" />
			</div>
			{searchQuery && (
				<div
					className={`sidebar-search-summary ${totalMatches === 0 ? "no-results" : ""}`}
				>
					<span>
						{totalMatches > 0
							? t("workbench.searchResultsSummary", {
									count: totalMatches,
									files: matchingFilesCount,
								})
							: t("workbench.noResultsFound")}
					</span>
				</div>
			)}

			<div
				className={`sidebar-search-results ${searchResults.length <= 1 ? "single-row" : ""}`}
			>
				{searchResults.map((fileGroup) => {
					const isCollapsed = collapsedFiles.has(fileGroup.documentId);
					return (
						<div key={fileGroup.documentId} className="search-file-group">
							<div className="search-file-header">
								<button
									type="button"
									className="search-file-title"
									onClick={() => toggleFileCollapsed(fileGroup.documentId)}
								>
									{isCollapsed ? (
										<ChevronRight size={13} />
									) : (
										<ChevronDown size={13} />
									)}
									<FileText size={13} className="doc-icon" />
									<span>{fileGroup.title}</span>
								</button>
								<div className="search-file-actions">
									{replaceOpen && (
										<button
											type="button"
											className="search-file-action-btn"
											title={t("workbench.replaceAllInFile")}
											onClick={() => {
												onSelectDocument?.(fileGroup.documentId);
												onReplaceAll?.(
													searchPattern,
													unescapeReplacementString(searchReplace),
												);
											}}
										>
											<Replace size={12} />
										</button>
									)}
									<button
										type="button"
										className="search-file-action-btn"
										title={t("workbench.openEditors")}
										onClick={() => {
											onSelectDocument?.(fileGroup.documentId);
										}}
									>
										<ExternalLink size={12} />
									</button>
									<button
										type="button"
										className="search-file-action-btn"
										title={t("workbench.dismiss")}
										onClick={() => {
											setDismissedFiles((prev) => {
												const next = new Set(prev);
												next.add(fileGroup.documentId);
												return next;
											});
										}}
									>
										<X size={12} />
									</button>
									<span className="search-pill-badge">
										{fileGroup.matches.length}
									</span>
								</div>
							</div>

							{!isCollapsed &&
								fileGroup.matches.map((match, idx) => {
									const matchRawKey = `${fileGroup.documentId}-${match.lineNumber}-${match.startOffset}`;
									const matchKey = `${matchRawKey}-${idx}`;
									const isMatchActive =
										activeMatchIndex >= 0 &&
										flatMatches[activeMatchIndex]?.key === matchKey;
									return (
										<div
											key={matchKey}
											className={`search-match-row ${isMatchActive ? "active" : ""}`}
										>
											<button
												type="button"
												className="search-match-main"
												onClick={() => {
													const matchIdx = flatMatches.findIndex(
														(m) => m.key === matchKey,
													);
													if (matchIdx >= 0) {
														setActiveMatchIndex(matchIdx);
													}
													onSelectDocument?.(fileGroup.documentId);
													onJumpToLine?.(match.lineNumber, match.startOffset);
												}}
											>
												<span className="search-match-line-num">
													{match.lineNumber}
												</span>
												<span className="search-match-text">
													{match.prefix}
													{replaceOpen ? (
														<>
															<del className="search-match-replace-del">
																{match.matchText}
															</del>
															{searchReplace ? (
																<ins className="search-match-replace-ins">
																	{searchReplace}
																</ins>
															) : null}
														</>
													) : (
														<mark className="search-match-highlight">
															{match.matchText}
														</mark>
													)}
													{match.suffix}
												</span>
											</button>
											<div className="search-match-actions">
												{replaceOpen && (
													<button
														type="button"
														className="search-match-action-btn"
														title={t("editor.find.replaceAction")}
														onClick={() => {
															onSelectDocument?.(fileGroup.documentId);
															onJumpToLine?.(
																match.lineNumber,
																match.startOffset,
															);
															onReplace?.(
																searchPattern,
																unescapeReplacementString(searchReplace),
																match.lineNumber,
																match.startOffset,
															);
														}}
													>
														<Replace size={11} />
													</button>
												)}
												<button
													type="button"
													className="search-match-action-btn"
													title={t("workbench.dismiss")}
													onClick={() => {
														setDismissedMatches((prev) => {
															const next = new Set(prev);
															next.add(matchRawKey);
															return next;
														});
													}}
												>
													<X size={11} />
												</button>
											</div>
										</div>
									);
								})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
