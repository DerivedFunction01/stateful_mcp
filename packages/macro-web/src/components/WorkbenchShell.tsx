import {
	LAYOUT_RATIO_BOUNDS,
	LAYOUT_RATIO_DEFAULTS,
	type WorkspaceSnapshot,
} from "@stateful-mcp/macro-protocol";
import {
	AlertTriangle,
	Box,
	ChevronRight,
	CircleDot,
	Files,
	PanelRight,
} from "lucide-react";
import {
	type CSSProperties,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useEditorSurfaceRegistry } from "../lib/editor-surface-registry";
import { useI18n } from "../lib/macro-i18n-provider";
import { Splitter } from "./Splitter";
import { Badge } from "./ui/primitives";

export function WorkbenchShell({
	snapshot,
	status = "loading",
	errorMessage,
	onCommand,
}: {
	readonly snapshot?: WorkspaceSnapshot;
	readonly status?: string;
	readonly errorMessage?: string;
	readonly onCommand: (command: string, args?: readonly unknown[]) => void;
}) {
	const { t } = useI18n();
	const [activeDomain, setActiveDomain] = useState<string>();
	const registry = useEditorSurfaceRegistry();
	const surfaceRef = useRef<HTMLTextAreaElement | null>(null);
	const [surfaceFocused, setSurfaceFocused] = useState(false);
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
		() => `editor:${snapshot?.activeTabId ?? "scratchpad"}`,
		[snapshot?.activeTabId],
	);
	useEffect(() => {
		const element = surfaceRef.current;
		if (!element) return;
		registry.register({
			id: surfaceId,
			element,
			focused: surfaceFocused,
			context: { focusedRegion: "main" },
			vimEnabled: false,
			mode: undefined,
		});
		return () => registry.unregister(surfaceId);
	}, [registry, surfaceId]);
	useEffect(() => {
		registry.update(surfaceId, {
			focused: surfaceFocused,
			context: { focusedRegion: "main" },
			vimEnabled: false,
			mode: undefined,
		});
	}, [registry, surfaceId, surfaceFocused]);
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
	const activeView = snapshot.contributions.views.find(
		(view) => view.containerId === snapshot.layout.activeContainerId,
	);
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
					className="workbench-tabs"
					role="tablist"
					aria-label={t("workbench.tabs")}
				>
					{snapshot.contributions.tabs.map((tab) => (
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
				<textarea
					className="workbench-editor-surface"
					ref={surfaceRef}
					readOnly
					aria-label={t("workbench.editor")}
					value={String(snapshot.scratchpad.text ?? "")}
					onFocus={() => setSurfaceFocused(true)}
					onBlur={() => setSurfaceFocused(false)}
				/>
				{!snapshot.scratchpad.text && (
					<p className="surface-empty">{t("workbench.empty")}</p>
				)}
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
			</aside>
		</div>
	);
}
