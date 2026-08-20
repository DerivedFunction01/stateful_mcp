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
	Files,
	PanelRight,
	Play,
	Plus,
	X,
} from "lucide-react";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { createBrowserVimController } from "../lib/browser-vim";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";
import { useI18n } from "../lib/macro-i18n-provider";
import { EditorOutputDrawer } from "./EditorOutputDrawer";
import {
	EditorSurfaceView,
	getEditorSurfaceAdapter,
} from "./EditorSurfaceView";
import { MacroSlotsInspector } from "./MacroSlotsInspector";
import { Splitter } from "./Splitter";
import { Button } from "./ui/primitives";

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
}: {
	readonly snapshot?: WorkspaceSnapshot;
	readonly status?: string;
	readonly errorMessage?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
	readonly editorDrafts: Readonly<Record<string, string>>;
	readonly editorConflict?: {
		readonly documentId: string;
		readonly localText: string;
		readonly result: EditorOperationResult;
	};
	readonly editorResult?: EditorOperationResult;
	readonly pendingEditorRequests: Readonly<Record<string, string>>;
	readonly editorError?: { readonly code?: string; readonly message: string };
	readonly onEditorOperation: (
		operation: EditorOperation,
	) => void | Promise<void>;
	readonly onSetEditorDraft: (documentId: string, text: string) => void;
	readonly onReloadEditorConflict: () => void | Promise<void>;
	readonly onOverwriteEditorConflict: () => void;
	readonly onEditorCursorChange?: (cursor: string) => void;
}) {
	const { t } = useI18n();
	const [activeDomain, setActiveDomain] = useState<string>();
	const registry = useEditorSurfaceRegistry();
	const surfaceRef = useRef<HTMLElement | null>(null);
	const [surfaceFocused, setSurfaceFocused] = useState(false);
	const [vimNotice, setVimNotice] = useState<string>();

	const getSurfaceAdapter = () => {
		const element = surfaceRef.current;
		if (!element) return undefined;
		return getEditorSurfaceAdapter(element, (text) => {
			if (activeDocumentMeta)
				onSetEditorDraft(activeDocumentMeta.documentId, text);
		});
	};

	const snapshotRef = useRef(snapshot);
	snapshotRef.current = snapshot;

	const [vimController] = useState(() =>
		createBrowserVimController(false, {
			getAdapter: getSurfaceAdapter,
			getKeymap: () => snapshotRef.current?.keymap,
			onCommandModeUnsupported: () =>
				setVimNotice(t("editor.commandModeUnsupported")),
		}),
	);

	const vimState = useSyncExternalStore(
		vimController.subscribe,
		vimController.getState,
		vimController.getState,
	);

	const activeDocument = snapshot?.editor.activeDocument;
	const activeDocumentMeta = snapshot?.editor.documents.find(
		(document) => document.documentId === snapshot?.editor.activeDocumentId,
	);
	const localDraft = activeDocumentMeta
		? editorDrafts[activeDocumentMeta.documentId]
		: undefined;
	const pendingEditor = activeDocumentMeta
		? pendingEditorRequests[activeDocumentMeta.documentId] !== undefined
		: false;

	const draftTimerRef = useRef<number | undefined>(undefined);
	const lastSubmittedDraftRef = useRef<{
		documentId: string;
		text: string;
		textRevision: number;
	} | null>(null);

	const requestId = () => crypto.randomUUID();

	const flushDraft = () => {
		if (!activeDocumentMeta || localDraft === undefined) return;
		const previous = lastSubmittedDraftRef.current;
		if (
			previous?.documentId === activeDocumentMeta.documentId &&
			previous.text === localDraft &&
			previous.textRevision === activeDocumentMeta.textRevision
		)
			return;
		lastSubmittedDraftRef.current = {
			documentId: activeDocumentMeta.documentId,
			text: localDraft,
			textRevision: activeDocumentMeta.textRevision,
		};
		void onEditorOperation({
			operation: "editor.replaceText",
			requestId: requestId(),
			documentId: activeDocumentMeta.documentId,
			text: localDraft,
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
							onClick={() => vimController.setEnabled(!vimState.enabled)}
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
							<button
								type="button"
								className="editor-preview-btn"
								title={t("editor.preview.title")}
								disabled={Boolean(
									editorConflict || localDraft !== undefined || pendingEditor,
								)}
								onClick={() =>
									emitEditorOperation({
										operation: "editor.previewDocument",
										requestId: requestId(),
										documentId: activeDocument.documentId,
										expectedTextRevision: activeDocument.textRevision,
									})
								}
							>
								<Play size={13} />
								<span>{t("editor.preview.title")}</span>
							</button>
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
							text={activeDocument.text}
							lines={activeDocument.lines}
							draft={localDraft}
							pinnedMacroIds={activeDocumentMeta.pinnedMacroIds}
							disabled={Boolean(editorConflict)}
							onTextChange={(text) =>
								onSetEditorDraft(activeDocumentMeta.documentId, text)
							}
							onFocusChange={(focused) => {
								setSurfaceFocused(focused);
								if (!focused) {
									if (draftTimerRef.current !== undefined)
										window.clearTimeout(draftTimerRef.current);
									flushDraft();
								}
							}}
							onCursorChange={onEditorCursorChange}
							onKeyDown={(event) => vimController.handleKeyDown(event)}
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

			{/* Secondary Sidepanel / Macro Slots Inspector */}
			<aside
				className="workbench-inspector"
				aria-label={t("workbench.inspector")}
			>
				<div className="workbench-sidebar-heading">
					<span>{t("workbench.inspector")}</span>
					<PanelRight size={14} />
				</div>

				<div className="inspector-content">
					<MacroSlotsInspector
						document={snapshot.editor.activeDocument}
						meta={activeDocumentMeta}
						onPin={(macroId) =>
							activeDocument &&
							emitEditorOperation({
								operation: "editor.pinMacro",
								requestId: requestId(),
								documentId: activeDocument.documentId,
								macroId,
							})
						}
					/>
				</div>
			</aside>
		</div>
	);
}
