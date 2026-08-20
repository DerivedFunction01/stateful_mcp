import {
	type EditorOperation,
	type EditorOperationResult,
	LAYOUT_RATIO_BOUNDS,
	LAYOUT_RATIO_DEFAULTS,
	type ScratchpadLineStatus,
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
import { Badge } from "./ui/primitives";

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
	const [vimController] = useState(() =>
		createBrowserVimController(false, {
			getAdapter: getSurfaceAdapter,
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
	const lineStatusLabel = (status: ScratchpadLineStatus) =>
		t(`editor.lineStatus.${status === "non-macro" ? "nonMacro" : status}`);
	const selectedLineRange = () => {
		const element = surfaceRef.current;
		const text =
			getEditorSurfaceAdapter(element, () => undefined)?.getText() ??
			activeDocument?.text ??
			"";
		const selection = getEditorSurfaceAdapter(
			element,
			() => undefined,
		)?.getSelection() ?? { start: 0, end: 0 };
		const start = selection.start;
		const end = selection.end;
		const lineAt = (offset: number) => text.slice(0, offset).split("\n").length;
		return { startLine: lineAt(start), endLine: lineAt(Math.max(start, end)) };
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
								<Box size={15} />
							)}
						</span>
						<span>{application.displayName}</span>
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
			<aside className="workbench-sidebar" aria-label={t("workbench.views")}>
				<div className="workbench-sidebar-heading">
					<span>{t("workbench.views")}</span>
					<Files size={15} />
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
									<ChevronRight size={13} /> {view.name}
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
			<section className="workbench-center">
				<div
					className="workbench-editor-groups"
					role="tablist"
					aria-label={t("editor.group.focus")}
				>
					{snapshot.editor.groups.map((group) => (
						<button
							key={group.groupId}
							className={
								group.groupId === snapshot.editor.activeGroupId
									? "editor-group active"
									: "editor-group"
							}
							type="button"
							role="tab"
							aria-selected={group.groupId === snapshot.editor.activeGroupId}
							title={t("editor.group.focus")}
							onClick={() =>
								emitEditorOperation({
									operation: "editor.focusGroup",
									requestId: requestId(),
									groupId: group.groupId,
									expectedWorkspaceRevision: snapshot.revision,
								})
							}
						>
							{group.groupId.slice(-4)}
						</button>
					))}
					{activeGroup &&
						snapshot.editor.documents
							.filter(
								(document) =>
									!activeGroup.documentIds.includes(document.documentId),
							)
							.map((document) => (
								<button
									key={`open:${document.documentId}`}
									type="button"
									title={t("editor.group.openDocument")}
									onClick={() => openDocumentInActiveGroup(document.documentId)}
								>
									{document.title}
								</button>
							))}
					<button
						type="button"
						aria-label={t("editor.toggleVim")}
						aria-pressed={vimState.enabled}
						disabled={!snapshot.editor.capabilities.canUseVim}
						onClick={() => vimController.setEnabled(!vimState.enabled)}
					>
						{vimState.enabled
							? t("editor.vimEnabled")
							: t("editor.vimDisabled")}
					</button>
					<button
						type="button"
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
						<Columns2 size={14} aria-hidden />
					</button>
					{activeGroup && snapshot.editor.groups.length > 1 && (
						<button
							type="button"
							title={t("editor.group.close")}
							onClick={() =>
								emitEditorOperation({
									operation: "editor.closeGroup",
									requestId: requestId(),
									groupId: activeGroup.groupId,
									expectedWorkspaceRevision: snapshot.revision,
								})
							}
						>
							<X size={14} aria-hidden />
						</button>
					)}
					{vimNotice && (
						<span className="editor-vim-notice" role="status">
							{vimNotice}
						</span>
					)}
				</div>
				<div
					className="workbench-tabs"
					role="tablist"
					aria-label={t("workbench.tabs")}
				>
					{activeGroupDocuments.map((document) => (
						<span className="workbench-document-tab" key={document.documentId}>
							<button
								className={
									document.documentId === snapshot.editor.activeDocumentId
										? "workbench-tab active"
										: "workbench-tab"
								}
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
								{document.title}
								{document.dirty ? " *" : ""}
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
								×
							</button>
						</span>
					))}
					<button
						className="workbench-tab"
						type="button"
						onClick={() =>
							emitEditorOperation({
								operation: "editor.newScratchpad",
								requestId: requestId(),
							})
						}
					>
						+ {t("editor.document.new")}
					</button>
					{snapshot.editor.templates.map((template) => (
						<button
							className="workbench-tab"
							key={template.templateId}
							type="button"
							title={template.description}
							onClick={() =>
								emitEditorOperation({
									operation: "editor.newScratchpadFromTemplate",
									requestId: requestId(),
									templateId: template.templateId,
								})
							}
						>
							+ {template.title}
						</button>
					))}
					{snapshot.contributions.tabs
						.filter((tab) => tab.id !== "scratchpad" && tab.id !== "notebook")
						.map((tab) => (
							<button
								className={
									snapshot.activeTabId === tab.id
										? "workbench-tab active"
										: "workbench-tab"
								}
								key={tab.id}
								type="button"
								onClick={() =>
									tab.id === "settings" && onCommand("workspace.openSettings")
								}
								role="tab"
								aria-selected={snapshot.activeTabId === tab.id}
							>
								{tab.label}
							</button>
						))}
				</div>
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
				{activeDocument && (
					<div className="editor-line-actions">
						<button
							type="button"
							disabled={Boolean(
								editorConflict || localDraft !== undefined || pendingEditor,
							)}
							onClick={() => {
								const { startLine } = selectedLineRange();
								emitEditorOperation({
									operation: "editor.executeLine",
									requestId: requestId(),
									documentId: activeDocument.documentId,
									lineNumber: startLine,
									expectedTextRevision: activeDocument.textRevision,
								});
							}}
						>
							{t("editor.execution.line")}
						</button>
						<button
							type="button"
							disabled={Boolean(
								editorConflict || localDraft !== undefined || pendingEditor,
							)}
							onClick={() => {
								const { startLine, endLine } = selectedLineRange();
								emitEditorOperation({
									operation: "editor.executeRange",
									requestId: requestId(),
									documentId: activeDocument.documentId,
									startLine,
									endLine,
									expectedTextRevision: activeDocument.textRevision,
								});
							}}
						>
							{t("editor.execution.range")}
						</button>
						<button
							type="button"
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
							{t("editor.execution.validLines")}
						</button>
						<button
							type="button"
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
							{t("editor.preview.title")}
						</button>
						{activeDocument.lines.map((line) => (
							<span
								key={line.lineNumber}
								className={`line-status ${line.lineStatus}`}
								role="status"
								aria-label={t(
									`editor.lineStatus.${line.lineStatus === "non-macro" ? "nonMacro" : line.lineStatus}.description`,
								)}
							>
								{line.lineNumber}: {lineStatusLabel(line.lineStatus)}
								{line.macroName && (
									<button
										type="button"
										aria-label={t("editor.document.pinMacro")}
										disabled={Boolean(
											editorConflict ||
												localDraft !== undefined ||
												pendingEditor,
										)}
										onClick={() =>
											emitEditorOperation({
												operation: "editor.pinMacro",
												requestId: requestId(),
												documentId: activeDocument.documentId,
												macroId: activeDocumentMeta?.pinnedMacroIds?.includes(
													line.macroName!,
												)
													? null
													: (line.macroName ?? null),
											})
										}
									>
										{t("editor.document.pinMacro")}
									</button>
								)}
							</span>
						))}
					</div>
				)}
				{editorResult?.status === "preview" && (
					<div className="editor-preview" aria-live="polite">
						<strong>{t("editor.preview.result")}</strong>
						{editorResult.lines.map((line) => (
							<div key={line.lineNumber}>
								{line.lineNumber}: {line.preview?.text ?? line.rawText}
							</div>
						))}
					</div>
				)}
				{snapshot.editor.groups.length > 1 && (
					<div className="editor-group-split-preview">
						{snapshot.editor.groups
							.filter(
								(group) => group.groupId !== snapshot.editor.activeGroupId,
							)
							.map((group) => {
								const document = snapshot.editor.documents.find(
									(item) => item.documentId === group.activeDocumentId,
								);
								return (
									<button
										className="editor-group-split-preview-pane"
										key={group.groupId}
										type="button"
										onClick={() =>
											emitEditorOperation({
												operation: "editor.focusGroup",
												requestId: requestId(),
												groupId: group.groupId,
												expectedWorkspaceRevision: snapshot.revision,
											})
										}
									>
										<strong>
											{document?.title ?? t("editor.group.notFound")}
										</strong>
										<span>{t("editor.group.focus")}</span>
									</button>
								);
							})}
					</div>
				)}
				{editorResult?.status === "accepted" &&
					(editorResult.receipts?.length ||
						editorResult.skippedLines?.length) && (
						<div className="editor-execution-result" aria-live="polite">
							<strong>{t("editor.execution.result")}</strong>
							{editorResult.receipts?.map((receipt) => (
								<div key={`${receipt.requestId}:${receipt.lineNumber}`}>
									{receipt.lineNumber}: {receipt.macroName} —{" "}
									{receipt.success
										? t("editor.execution.succeeded")
										: t("editor.execution.failed")}
								</div>
							))}
							{editorResult.skippedLines?.map((line) => (
								<div key={`skipped:${line.lineNumber}`}>
									{line.lineNumber}: {t("editor.execution.skipped")} —{" "}
									{lineStatusLabel(line.lineStatus)}
								</div>
							))}
						</div>
					)}
				{editorConflict && (
					<div className="editor-conflict" role="alert">
						<strong>{t("editor.input.conflict.title")}</strong>
						<span>{t("editor.input.conflict.message")}</span>
						<button
							type="button"
							onClick={() => {
								if (window.confirm(t("editor.input.conflict.reloadConfirm")))
									void onReloadEditorConflict();
							}}
						>
							{t("editor.input.conflict.reloadHost")}
						</button>
						<button type="button" onClick={onOverwriteEditorConflict}>
							{t("editor.input.conflict.keepLocal")}
						</button>
						<button
							type="button"
							onClick={() => {
								void navigator.clipboard?.writeText(editorConflict.localText);
							}}
						>
							{t("editor.input.conflict.copyLocal")}
						</button>
					</div>
				)}
				{pendingEditor && (
					<span className="editor-pending" role="status">
						{t("editor.input.pending")}
					</span>
				)}
				{editorError && !editorConflict && (
					<div className="editor-error" role="alert">
						{t("editor.input.rejected")}
					</div>
				)}
				<EditorOutputDrawer output={snapshot.editor.output} />
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
			<aside
				className="workbench-inspector"
				aria-label={t("workbench.inspector")}
			>
				<div className="workbench-sidebar-heading">
					<span>{t("workbench.inspector")}</span>
					<PanelRight size={15} />
				</div>
				<div className="project-card">
					<span className="field-label">{t("workbench.project")}</span>
					<strong>
						{snapshot.project?.displayName ?? t("workbench.noProject")}
					</strong>
					<Badge tone={snapshot.project ? "success" : "warning"}>
						{snapshot.project?.lifecycle ?? t("workbench.unavailable")}
					</Badge>
				</div>
				<div className="inspector-card">
					<div className="card-title">
						<AlertTriangle size={15} /> {t("status.diagnostics")}
					</div>
					<strong>{snapshot.diagnostics.length}</strong>
				</div>
				<div className="inspector-card editor-output-card">
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
