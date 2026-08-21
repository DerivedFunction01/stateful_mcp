import {
	type EditorOperation,
	type EditorOperationResult,
	LAYOUT_RATIO_BOUNDS,
	LAYOUT_RATIO_DEFAULTS,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	AlertTriangle,
	Box,
	ChevronRight,
	CircleDot,
	Columns2,
	Eraser,
	Files,
	PanelRight,
	Pin,
	Play,
	Plus,
	RotateCcw,
	X,
} from "lucide-react";
import {
	type CSSProperties,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createBrowserVimController } from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";
import { useI18n } from "../lib/macro-i18n-provider";
import {
	loadUserPreferences,
	saveUserPreferences,
} from "../lib/user-preferences-storage";
import { EditorOutputDrawer } from "./EditorOutputDrawer";
import {
	EditorSurfaceView,
	getEditorSurfaceAdapter,
} from "./EditorSurfaceView";
import { Splitter } from "./Splitter";
import { Button } from "./ui/primitives";
import { WorkbenchInspector } from "./WorkbenchInspector";

export function WorkbenchShell({
	snapshot,
	status = "loading",
	errorMessage,
	onCommand,
	editorDrafts,
	editorConflict,
	editorResult,
	pendingEditorRequests,
	editorError,
	onEditorOperation,
	onSetEditorDraft,
	onReloadEditorConflict,
	onOverwriteEditorConflict,
	onEditorCursorChange,
	onOpenPalette,
	onOpenSearch,
	searchWidget,
}: {
	readonly snapshot?: WorkspaceSnapshot;
	readonly status?: string;
	readonly errorMessage?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
	readonly editorDrafts: Readonly<Record<string, readonly string[]>>;
	readonly editorConflict?: {
		readonly documentId: string;
		readonly localLines: readonly string[];
		readonly result: EditorOperationResult;
	};
	readonly editorResult?: EditorOperationResult;
	readonly pendingEditorRequests: Readonly<Record<string, string>>;
	readonly editorError?: { readonly code?: string; readonly message: string };
	readonly onEditorOperation: (
		operation: EditorOperation,
	) => void | Promise<void>;
	readonly onSetEditorDraft: (
		documentId: string,
		lines: readonly string[],
	) => void;
	readonly onReloadEditorConflict: () => void | Promise<void>;
	readonly onOverwriteEditorConflict: () => void;
	readonly onEditorCursorChange?: (cursor: string) => void;
	readonly onOpenPalette?: (
		initialQuery?: string,
		commandMode?: boolean,
		commandToken?: string,
	) => void;
	readonly onOpenSearch?: (direction: "forward" | "backward") => void;
	readonly searchWidget?: ReactNode;
}) {
	const { t } = useI18n();
	const [activeDomain, setActiveDomain] = useState<string>();
	const registry = useEditorSurfaceRegistry();
	const surfaceRef = useRef<HTMLElement | null>(null);
	const [surfaceFocused, setSurfaceFocused] = useState(false);
	const [vimNotice, setVimNotice] = useState<string>();
	const snapshotRef = useRef(snapshot);
	snapshotRef.current = snapshot;
	const onOpenSearchRef = useRef(onOpenSearch);
	onOpenSearchRef.current = onOpenSearch;
	const onSetEditorDraftRef = useRef(onSetEditorDraft);
	onSetEditorDraftRef.current = onSetEditorDraft;
	const activeDocument = snapshot?.editor.activeDocument;
	const activeDocumentMeta = snapshot?.editor.documents.find(
		(document) => document.documentId === snapshot?.editor.activeDocumentId,
	);

	const getSurfaceAdapter = () => {
		const element = surfaceRef.current;
		if (!element) return undefined;
		const currentSnapshot = snapshotRef.current;
		const currentDocument = currentSnapshot?.editor.activeDocument;
		const currentDocumentMeta = currentSnapshot?.editor.documents.find(
			(document) =>
				document.documentId === currentSnapshot?.editor.activeDocumentId,
		);
		return getEditorSurfaceAdapter(
			element,
			(text) => {
				if (currentDocumentMeta)
					onSetEditorDraftRef.current(currentDocumentMeta.documentId, text);
			},
			{
				documentId: currentDocument?.documentId,
				textRevision: currentDocument?.textRevision,
			},
		);
	};

	const [vimController] = useState(() =>
		createBrowserVimController(loadUserPreferences().vimEnabled, {
			variant: "scratchpad",
			getAdapter: getSurfaceAdapter,
			getKeymap: () => snapshotRef.current?.keymap,
			onOpenCommandMode: (initialQuery, commandMode, commandToken) =>
				onOpenPalette?.(initialQuery ?? "", commandMode, commandToken ?? ""),
			onOpenSearch: (direction) => onOpenSearchRef.current?.(direction),
			onExecuteLine: (lineNum) => {
				const activeDoc = snapshotRef.current?.editor.activeDocument;
				if (!activeDoc) return;
				const targetLine =
					lineNum ?? (getSurfaceAdapter()?.getActiveCellIndex?.() ?? 0) + 1;
				void onEditorOperation({
					operation: "editor.executeLine",
					requestId: crypto.randomUUID(),
					documentId: activeDoc.documentId,
					lineNumber: targetLine,
					expectedTextRevision: activeDoc.textRevision,
				});
			},
			onExecuteRange: (startLine, endLine) => {
				const activeDoc = snapshotRef.current?.editor.activeDocument;
				if (!activeDoc) return;
				void onEditorOperation({
					operation: "editor.executeRange",
					requestId: crypto.randomUUID(),
					documentId: activeDoc.documentId,
					startLine,
					endLine,
					expectedTextRevision: activeDoc.textRevision,
				});
			},
			onExecuteValidLines: () => {
				const activeDoc = snapshotRef.current?.editor.activeDocument;
				if (!activeDoc) return;
				void onEditorOperation({
					operation: "editor.executeValidLines",
					requestId: crypto.randomUUID(),
					documentId: activeDoc.documentId,
					expectedTextRevision: activeDoc.textRevision,
				});
			},
		}),
	);

	const vimState = useSyncExternalStore(
		vimController.subscribe,
		vimController.getState,
		vimController.getState,
	);

	const localDraft = activeDocumentMeta
		? editorDrafts[activeDocumentMeta.documentId]
		: undefined;
	const activeLines =
		localDraft ?? activeDocument?.lines.map((line) => line.rawText) ?? [];
	const pendingEditor = activeDocumentMeta
		? pendingEditorRequests[activeDocumentMeta.documentId] !== undefined
		: false;

	const draftTimerRef = useRef<number | undefined>(undefined);
	const lastSubmittedDraftRef = useRef<{
		documentId: string;
		lines: readonly string[];
		textRevision: number;
	} | null>(null);

	const requestId = () => crypto.randomUUID();

	const flushDraft = () => {
		if (!activeDocumentMeta || localDraft === undefined) return;
		const previous = lastSubmittedDraftRef.current;
		if (
			previous?.documentId === activeDocumentMeta.documentId &&
			linesEqual(previous?.lines, localDraft) &&
			previous.textRevision === activeDocumentMeta.textRevision
		)
			return;
		lastSubmittedDraftRef.current = {
			documentId: activeDocumentMeta.documentId,
			lines: localDraft,
			textRevision: activeDocumentMeta.textRevision,
		};
		void onEditorOperation({
			operation: "editor.replaceText",
			requestId: requestId(),
			documentId: activeDocumentMeta.documentId,
			lines: localDraft,
			expectedTextRevision: activeDocumentMeta.textRevision,
		});
	};

	const shellRef = useRef<HTMLDivElement | null>(null);
	const domainRatio =
		snapshot?.layout.domainRailWidthRatio ?? LAYOUT_RATIO_DEFAULTS.domainRail;
	const sidebarRatio =
		snapshot?.layout.regions.activity?.widthRatio ??
		LAYOUT_RATIO_DEFAULTS.activity;
	const inspectorRatio =
		snapshot?.layout.regions.inspector?.widthRatio ??
		LAYOUT_RATIO_DEFAULTS.inspector;
	const totalFr = domainRatio + sidebarRatio + 1 + inspectorRatio;

	const surfaceId = useMemo(
		() => `editor:${snapshot?.editor.activeDocumentId ?? "inactive"}`,
		[snapshot?.editor.activeDocumentId],
	);

	useEffect(() => {
		const element = surfaceRef.current;
		if (!element) return;
		registry.register({
			id: surfaceId,
			element,
			focused: surfaceFocused,
			context: {
				focusedRegion: "main",
				activeDocumentId: snapshot?.editor.activeDocumentId ?? undefined,
				editorMode: vimState.mode,
				textInputOwner: "editor",
			},
			vimEnabled: vimState.enabled,
			mode: vimState.mode,
			adapter: getSurfaceAdapter(),
			handleKeyDown: (event) => vimController.handleKeyDown(event),
		});
		return () => registry.unregister(surfaceId);
	}, [registry, surfaceId]);

	useEffect(() => {
		registry.update(surfaceId, {
			focused: surfaceFocused,
			context: {
				focusedRegion: "main",
				activeDocumentId: snapshot?.editor.activeDocumentId ?? undefined,
				editorMode: vimState.mode,
				textInputOwner: "editor",
			},
			vimEnabled: vimState.enabled,
			mode: vimState.mode,
			adapter: getSurfaceAdapter(),
			handleKeyDown: (event) => vimController.handleKeyDown(event),
		});
	}, [
		registry,
		surfaceId,
		surfaceFocused,
		snapshot?.editor.activeDocumentId,
		vimController,
		vimState.enabled,
		vimState.mode,
	]);

	useEffect(() => {
		if (localDraft === undefined) {
			lastSubmittedDraftRef.current = null;
			return;
		}
		if (draftTimerRef.current !== undefined)
			window.clearTimeout(draftTimerRef.current);
		draftTimerRef.current = window.setTimeout(flushDraft, 250);
		return () => {
			if (draftTimerRef.current !== undefined)
				window.clearTimeout(draftTimerRef.current);
		};
	}, [
		activeDocumentMeta?.documentId,
		activeDocumentMeta?.textRevision,
		localDraft,
	]);

	if (status === "error") {
		return (
			<section className="workbench-state" aria-live="assertive">
				<strong>{t("workbench.unavailable")}</strong>
				<p>{errorMessage ?? t("common.error")}</p>
			</section>
		);
	}

	if (!snapshot) {
		return (
			<section className="workbench-state" aria-live="polite">
				<CircleDot size={28} />
				<strong>{t("common.loading")}</strong>
			</section>
		);
	}

	const activeDomainId = activeDomain ?? snapshot.applications[0]?.id;
	const activeGroup = snapshot.editor.groups.find(
		(group) => group.groupId === snapshot.editor.activeGroupId,
	);
	const activeGroupDocuments = activeGroup
		? snapshot.editor.documents.filter((document) =>
				activeGroup.documentIds.includes(document.documentId),
			)
		: snapshot.editor.documents;
	const activeView = snapshot.contributions.views.find(
		(view) => view.containerId === snapshot.layout.activeContainerId,
	);

	const emitEditorOperation = (operation: EditorOperation) => {
		void onEditorOperation(operation);
	};

	const openDocumentInActiveGroup = (documentId: string) => {
		if (!activeGroup) return;
		emitEditorOperation({
			operation: "editor.openDocumentInGroup",
			requestId: requestId(),
			groupId: activeGroup.groupId,
			documentId,
			expectedWorkspaceRevision: snapshot.revision,
		});
	};

	const handleInsertSnippet = (snippet: string) => {
		if (!activeDocumentMeta) return;
		const currentLines = localDraft ??
			activeDocument?.lines.map((l) => l.rawText) ?? [""];
		const targetIdx = vimState.activeCellIndex ?? currentLines.length - 1;
		const newLines = [...currentLines];
		if (newLines[targetIdx] === "" || newLines[targetIdx] === undefined) {
			newLines[targetIdx] = snippet;
		} else {
			newLines.splice(targetIdx + 1, 0, snippet);
		}
		onSetEditorDraft(activeDocumentMeta.documentId, newLines);
	};

	return (
		<div
			className="workbench-shell"
			ref={shellRef}
			style={
				{
					"--domain-rail-ratio": domainRatio,
					"--sidebar-ratio": sidebarRatio,
					"--inspector-ratio": inspectorRatio,
					"--domain-rail-track": `${domainRatio}fr`,
					"--sidebar-track": `${sidebarRatio}fr`,
					"--inspector-track": `${inspectorRatio}fr`,
				} as CSSProperties
			}
		>
			{/* Domain / Apps Rail */}
			<aside
				className="workbench-domain-rail"
				aria-label={t("workbench.domainApps")}
			>
				<div className="rail-section-label">{t("workbench.domainApps")}</div>
				{snapshot.applications.map((application) => (
					<button
						className={
							activeDomainId === application.id
								? "domain-button active"
								: "domain-button"
						}
						key={application.id}
						type="button"
						onClick={() => setActiveDomain(application.id)}
						title={application.description ?? application.displayName}
					>
						<span className="domain-icon">
							{application.icon ? (
								<span aria-hidden>{application.icon}</span>
							) : (
								<Box size={14} />
							)}
						</span>
						<span className="domain-label">{application.displayName}</span>
					</button>
				))}
			</aside>

			<Splitter
				orientation="vertical"
				region="domain"
				label={t("workbench.resizeDomainRail")}
				value={domainRatio}
				min={LAYOUT_RATIO_BOUNDS.min}
				max={LAYOUT_RATIO_BOUNDS.max}
				step={0.02}
				totalFr={totalFr}
				containerRef={shellRef}
				onChange={(next) =>
					onCommand("layout.setDomainRailWidthRatio", [{ ratio: next }])
				}
			/>

			{/* Views / Explorer Sidebar */}
			<aside className="workbench-sidebar" aria-label={t("workbench.views")}>
				<div className="workbench-sidebar-heading">
					<span>{t("workbench.views")}</span>
					<Files size={14} />
				</div>
				{snapshot.contributions.containers.map((container) => (
					<div className="view-container" key={container.id}>
						<div className="view-container-title">{container.title}</div>
						{snapshot.contributions.views
							.filter((view) => view.containerId === container.id)
							.map((view) => (
								<button
									className={
										activeView?.id === view.id
											? "view-button active"
											: "view-button"
									}
									key={view.id}
									type="button"
								>
									<ChevronRight size={12} /> {view.name}
								</button>
							))}
					</div>
				))}
			</aside>

			<Splitter
				orientation="vertical"
				region="sidebar"
				label={t("workbench.resizeSidebar")}
				value={sidebarRatio}
				min={LAYOUT_RATIO_BOUNDS.min}
				max={LAYOUT_RATIO_BOUNDS.max}
				step={0.02}
				totalFr={totalFr}
				containerRef={shellRef}
				onChange={(next) =>
					onCommand("layout.setRegionWidthRatio", [
						{ region: "activity", ratio: next },
					])
				}
			/>

			{/* Center Editor Canvas */}
			<section className="workbench-center">
				{/* Editor Group Header & Tabs */}
				<div className="editor-group-header">
					<div
						className="workbench-tabs"
						role="tablist"
						aria-label={t("workbench.tabs")}
					>
						{activeGroupDocuments.map((document) => (
							<div
								className={`workbench-document-tab ${document.documentId === snapshot.editor.activeDocumentId ? "active" : ""}`}
								key={document.documentId}
							>
								<button
									className="tab-title-btn"
									type="button"
									onClick={() => {
										if (localDraft !== undefined) {
											flushDraft();
											return;
										}
										if (
											activeGroup &&
											!activeGroup.documentIds.includes(document.documentId)
										)
											openDocumentInActiveGroup(document.documentId);
										else
											emitEditorOperation({
												operation: "editor.selectDocument",
												requestId: requestId(),
												documentId: document.documentId,
											});
									}}
									onDoubleClick={() => {
										const title = window.prompt(
											t("editor.document.rename"),
											document.title,
										);
										if (title)
											emitEditorOperation({
												operation: "editor.renameDocument",
												requestId: requestId(),
												documentId: document.documentId,
												title,
											});
									}}
									role="tab"
									aria-selected={
										document.documentId === snapshot.editor.activeDocumentId
									}
								>
									<span>{document.title}</span>
									{document.dirty && (
										<span className="tab-dirty-indicator">*</span>
									)}
								</button>
								<button
									className="workbench-tab-close"
									type="button"
									aria-label={t("editor.document.close")}
									disabled={snapshot.editor.documents.length <= 1}
									onClick={() => {
										if (localDraft !== undefined) {
											flushDraft();
											return;
										}
										emitEditorOperation({
											operation: "editor.closeDocument",
											requestId: requestId(),
											documentId: document.documentId,
											expectedTextRevision: document.textRevision,
											force: false,
										});
									}}
								>
									<X size={12} />
								</button>
							</div>
						))}

						<button
							className="tab-new-btn"
							type="button"
							title={t("editor.document.new")}
							onClick={() =>
								emitEditorOperation({
									operation: "editor.newScratchpad",
									requestId: requestId(),
								})
							}
						>
							<Plus size={14} />
						</button>
					</div>

					<div className="editor-group-actions">
						<button
							type="button"
							className={`vim-toggle-btn ${vimState.enabled ? "active" : ""}`}
							aria-label={t("editor.toggleVim")}
							aria-pressed={vimState.enabled}
							disabled={!snapshot.editor.capabilities.canUseVim}
							onClick={() => {
								const next = !vimState.enabled;
								vimController.setEnabled(next);
								saveUserPreferences({ vimEnabled: next });
							}}
							title={
								vimState.enabled
									? t("editor.vimEnabled")
									: t("editor.vimDisabled")
							}
						>
							<span>VIM</span>
						</button>

						<button
							type="button"
							className="editor-split-btn"
							title={t("editor.group.split")}
							disabled={!snapshot.editor.capabilities.canSplit || pendingEditor}
							onClick={() =>
								emitEditorOperation({
									operation: "editor.createSplitGroup",
									requestId: requestId(),
									sourceGroupId: activeGroup?.groupId,
									documentId: activeDocument?.documentId,
									expectedWorkspaceRevision: snapshot.revision,
								})
							}
						>
							<Columns2 size={14} />
						</button>

						{activeDocument && (
							<>
								<button
									type="button"
									className="editor-preview-btn"
									title={t("editor.execution.validLines")}
									disabled={Boolean(
										editorConflict || localDraft !== undefined || pendingEditor,
									)}
									onClick={() =>
										emitEditorOperation({
											operation: "editor.executeValidLines",
											requestId: requestId(),
											documentId: activeDocument.documentId,
											expectedTextRevision: activeDocument.textRevision,
										})
									}
								>
									<Play size={13} />
									<span>{t("editor.runAll")}</span>
								</button>
								<button
									type="button"
									className="editor-split-btn"
									title={t("editor.clearExecuted")}
									disabled={Boolean(
										editorConflict || localDraft !== undefined || pendingEditor,
									)}
									onClick={() =>
										emitEditorOperation({
											operation: "editor.clearExecutedLines",
											requestId: requestId(),
											documentId: activeDocument.documentId,
											expectedTextRevision: activeDocument.textRevision,
										})
									}
								>
									<Eraser size={14} />
								</button>
								<button
									type="button"
									className="editor-split-btn"
									title={t("editor.resetExecution")}
									disabled={Boolean(
										editorConflict || localDraft !== undefined || pendingEditor,
									)}
									onClick={() =>
										emitEditorOperation({
											operation: "editor.resetExecutionState",
											requestId: requestId(),
											documentId: activeDocument.documentId,
										})
									}
								>
									<RotateCcw size={14} />
								</button>
								{snapshot.contributions?.pinnedMacros &&
									snapshot.contributions.pinnedMacros.length > 0 && (
										<div className="editor-quickrun-bar">
											<span className="quickrun-label">
												<Pin size={11} />
											</span>
											{snapshot.contributions.pinnedMacros.map((macro) => (
												<button
													key={macro.id}
													type="button"
													className={`quickrun-chip quickrun-${macro.source}`}
													title={macro.title ?? `Quick-run ^${macro.macroName}`}
													onClick={() => {
														const snippet =
															macro.snippet ?? `^${macro.macroName} `;
														handleInsertSnippet(snippet);
													}}
												>
													^{macro.macroName}
												</button>
											))}
										</div>
									)}
							</>
						)}
					</div>
				</div>

				{vimNotice && (
					<div className="editor-vim-notice" role="status">
						{vimNotice}
					</div>
				)}

				{/* Editor Surface */}
				<div className="editor-main-canvas">
					{activeDocument && activeDocumentMeta ? (
						<EditorSurfaceView
							key={activeDocumentMeta.documentId}
							documentId={activeDocumentMeta.documentId}
							lines={activeDocument.lines}
							draft={localDraft}
							pinnedMacroIds={activeDocumentMeta.pinnedMacroIds}
							disabled={Boolean(editorConflict)}
							activeCellIndex={
								vimState.enabled ? vimState.activeCellIndex : undefined
							}
							selectedCellRange={vimState.enabled ? vimState.visualRange : null}
							vimEnabled={vimState.enabled}
							vimMode={vimState.mode}
							searchWidget={searchWidget}
							onTextChange={(lines) =>
								onSetEditorDraft(activeDocumentMeta.documentId, lines)
							}
							onFocusChange={(focused) => {
								setSurfaceFocused(focused);
								if (focused && vimState.mode === "COMMAND")
									vimController.exitCommandMode();
								if (!focused) {
									if (draftTimerRef.current !== undefined)
										window.clearTimeout(draftTimerRef.current);
									flushDraft();
								}
							}}
							onCursorChange={(cursor) => {
								onEditorCursorChange?.(cursor);
								if (vimState.enabled && vimState.mode !== "INSERT") return;
								const line = Number.parseInt(cursor.split(":")[0] ?? "", 10);
								const column = Number.parseInt(cursor.split(":")[1] ?? "", 10);
								if (Number.isFinite(line))
									vimController.setActiveCell(
										line - 1,
										Math.max(1, activeLines.length),
										Number.isFinite(column) ? column - 1 : undefined,
									);
							}}
							onKeyDown={(event) => vimController.handleKeyDown(event)}
							onPointerTarget={(lineIndex, column, dragging) =>
								vimController.setPointerTarget(
									lineIndex,
									Math.max(1, activeLines.length),
									column,
									dragging,
								)
							}
							surfaceRef={surfaceRef}
							onExecuteLine={(lineNumber) =>
								emitEditorOperation({
									operation: "editor.executeLine",
									requestId: requestId(),
									documentId: activeDocument.documentId,
									lineNumber,
									expectedTextRevision: activeDocument.textRevision,
								})
							}
							onExecuteRange={(startLine, endLine) =>
								emitEditorOperation({
									operation: "editor.executeRange",
									requestId: requestId(),
									documentId: activeDocument.documentId,
									startLine,
									endLine,
									expectedTextRevision: activeDocument.textRevision,
								})
							}
							onPinMacro={(macroId) =>
								emitEditorOperation({
									operation: "editor.pinMacro",
									requestId: requestId(),
									documentId: activeDocument.documentId,
									macroId,
								})
							}
						/>
					) : (
						<section className="editor-unavailable" role="status">
							<strong>{t("editor.inactive.title")}</strong>
							<span>{t("editor.inactive.description")}</span>
						</section>
					)}

					{/* Conflict Alert Banner */}
					{editorConflict && (
						<div className="editor-conflict-banner" role="alert">
							<AlertTriangle size={16} />
							<div className="conflict-info">
								<strong>{t("editor.input.conflict.title")}</strong>
								<span>{t("editor.input.conflict.message")}</span>
							</div>
							<div className="conflict-actions">
								<Button
									variant="secondary"
									onClick={() => {
										if (
											window.confirm(t("editor.input.conflict.reloadConfirm"))
										)
											void onReloadEditorConflict();
									}}
								>
									{t("editor.input.conflict.reloadHost")}
								</Button>
								<Button variant="primary" onClick={onOverwriteEditorConflict}>
									{t("editor.input.conflict.keepLocal")}
								</Button>
							</div>
						</div>
					)}
				</div>

				{/* Collapsible Docked Output Drawer */}
				<EditorOutputDrawer
					output={snapshot.editor.output}
					result={editorResult}
					onReverseEntry={(entryId: string) =>
						onCommand("journal.reverseEntry", [{ entryId }])
					}
				/>
			</section>

			<Splitter
				orientation="vertical"
				region="inspector"
				label={t("workbench.resizeInspector")}
				value={inspectorRatio}
				min={LAYOUT_RATIO_BOUNDS.min}
				max={LAYOUT_RATIO_BOUNDS.max}
				step={0.02}
				totalFr={totalFr}
				containerRef={shellRef}
				onChange={(next) =>
					onCommand("layout.setRegionWidthRatio", [
						{ region: "inspector", ratio: next },
					])
				}
			/>

			{/* Secondary Sidepanel / Workbench Inspector */}
			<aside
				className="workbench-inspector"
				aria-label={t("workbench.inspector")}
			>
				<div className="workbench-sidebar-heading">
					<span>{t("workbench.inspector")}</span>
					<PanelRight size={14} />
				</div>

				<div className="inspector-content">
					<WorkbenchInspector
						document={snapshot.editor.activeDocument}
						meta={activeDocumentMeta}
						activeLineIndex={
							vimState.enabled ? vimState.activeCellIndex : undefined
						}
						pinnedMacros={snapshot.contributions?.pinnedMacros}
						onPin={(macroId) =>
							activeDocument &&
							emitEditorOperation({
								operation: "editor.pinMacro",
								requestId: requestId(),
								documentId: activeDocument.documentId,
								macroId,
							})
						}
						onJumpToLine={(lineNumber) => {
							vimController.setActiveCell(
								lineNumber - 1,
								Math.max(1, activeLines.length),
							);
						}}
						onInsertSnippet={handleInsertSnippet}
					/>
				</div>
			</aside>
		</div>
	);
}

function linesEqual(
	left: readonly string[] | undefined,
	right: readonly string[],
): boolean {
	return (
		left !== undefined &&
		left.length === right.length &&
		left.every((line, index) => line === right[index])
	);
}
