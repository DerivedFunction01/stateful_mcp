import type {
	EditorMode,
	HorizontalAlignment,
} from "@stateful-mcp/macro-protocol";
import {
	Bell,
	Check,
	CircleAlert,
	Cloud,
	FolderGit2,
	Keyboard,
	Layers,
	Terminal,
	WifiOff,
} from "lucide-react";
import { useActiveEditorSurface } from "../lib/editor-surface-registry";
import { useI18n, type WebI18nKey } from "../lib/macro-i18n-provider";
import { cn } from "../lib/utils";
import { IconButton } from "./ui/primitives";

export interface StatusBarSegment {
	readonly id: string;
	readonly alignment: HorizontalAlignment;
	readonly priority: number;
	readonly minContainerWidth?: "compact" | "comfortable" | "wide";
	readonly label?: string;
	readonly value?: string;
	readonly icon?: React.ReactNode;
	readonly tone?:
		| "default"
		| "info"
		| "success"
		| "warning"
		| "danger"
		| "accent";
	readonly tooltip?: string;
	readonly command?: string;
	readonly overflowable?: boolean;
}

export interface StatusBarProps {
	readonly vimMode?: EditorMode;
	readonly vimEnabled?: boolean;
	readonly editorFocused?: boolean;
	readonly dirty?: boolean;
	readonly diagnostics?: number;
	readonly connected?: boolean;
	readonly profile?: string;
	readonly domain?: string;
	readonly project?: string;
	readonly cursor?: string;
	readonly commandMode?: boolean;
	readonly commandText?: string;
	readonly commandToken?: string;
	readonly onAction?: (command: string) => void;
}

/**
 * Status bar that derives Vim presentation from the active editor-surface
 * registry. When no registered surface owns focus (or it is not Vim-enabled),
 * the Vim segment is not shown and no editor-only command is offered. Explicit
 * props override the registry (used by dev fixtures).
 */
export function RegisteredStatusBar(props: StatusBarProps) {
	const active = useActiveEditorSurface();
	const vimMode = props.vimMode ?? active?.mode;
	const vimEnabled = props.vimEnabled ?? active?.vimEnabled ?? false;
	const editorFocused = props.editorFocused ?? active !== undefined;
	return (
		<StatusBar
			{...props}
			vimMode={vimMode}
			vimEnabled={vimEnabled}
			editorFocused={editorFocused}
			commandMode={props.commandMode}
			commandText={props.commandText}
			commandToken={props.commandToken}
		/>
	);
}

const VIM_COMMAND_HINTS: Record<string, string> = {
	w: "Save Active Tab",
	write: "Save Active Tab",
	wa: "Save All Tabs",
	wall: "Save All Tabs",
	wq: "Save & Close",
	wqa: "Save All & Quit",
	q: "Quit Application",
	quit: "Quit Application",
	qa: "Quit All",
	quitall: "Quit All",
	open: "Open Project",
	edit: "Open Project",
	e: "Open Project",
	saveas: "Save As Project",
	split: "Split Editor Right",
	vsplit: "Split Editor Right",
	sp: "Split Editor Right",
	vs: "Split Editor Right",
	new: "New Scratchpad",
	tabnew: "New Scratchpad",
	dup: "Duplicate Document",
	duplicate: "Duplicate Document",
	settings: "Open Settings",
};

function getVimCommandLabel(text?: string, token?: string): string {
	const raw = (text || token || "").trim();
	const clean = raw.replace(/^:/, "").trim();
	if (!clean) return ": [w, wa, wq, q, split, dup, open, saveas]";
	const match = VIM_COMMAND_HINTS[clean.toLowerCase()];
	if (match) return `:${clean} → ${match}`;
	return `:${clean}`;
}

export function StatusBar({
	vimMode,
	vimEnabled = false,
	editorFocused = true,
	dirty = false,
	diagnostics = 0,
	connected = true,
	profile = "",
	domain = "",
	project = "",
	cursor = "",
	commandMode = false,
	commandText = "",
	commandToken = "",
	onAction,
}: StatusBarProps) {
	const { t } = useI18n();
	const segments: StatusBarSegment[] = [
		{
			id: "connection",
			alignment: "left",
			priority: 100,
			value: connected ? t("status.local") : t("status.offline"),
			icon: connected ? <Cloud size={13} /> : <WifiOff size={13} />,
			tone: connected ? "info" : "danger",
			command: "host.openDiagnostics",
		},
		...(project
			? [
					{
						id: "project",
						alignment: "left" as const,
						priority: 95,
						value: project,
						icon: <FolderGit2 size={13} />,
						tone: "accent" as const,
						command: "workbench.openProject",
					},
				]
			: []),
		...(domain
			? [
					{
						id: "domain",
						alignment: "left" as const,
						priority: 90,
						value: domain,
						icon: <Terminal size={13} />,
						tone: "accent" as const,
					},
				]
			: []),
		...(profile
			? [
					{
						id: "profile",
						alignment: "left" as const,
						priority: 80,
						value: profile,
						icon: <Layers size={13} />,
						command: "keymaps.switchProfile",
					},
				]
			: []),
		{
			id: "diagnostics",
			alignment: "left",
			priority: 70,
			value: diagnostics
				? t("shell.diagnostics.errors", { count: diagnostics })
				: t("status.zeroDiagnostics"),
			icon: diagnostics ? <CircleAlert size={13} /> : <Check size={13} />,
			tone: diagnostics ? "danger" : "success",
			command: "diagnostics.open",
		},
		...(vimEnabled && editorFocused && vimMode
			? [
					{
						id: "vim-mode",
						alignment: "right" as const,
						priority: 100,
						value: t(`shell.mode.${vimMode.toLowerCase()}` as WebI18nKey),
						icon: <Keyboard size={13} />,
						tone: "accent" as const,
						command: "scratchpad.configureVim",
					},
				]
			: []),
		...(commandMode
			? [
					{
						id: "vim-command",
						alignment: "right" as const,
						priority: 105,
						value: getVimCommandLabel(commandText, commandToken),
						tone: "accent" as const,
					},
				]
			: []),
		{
			id: "cursor",
			alignment: "right",
			priority: 90,
			value: cursor,
			overflowable: true,
		},
		{
			id: "macro",
			alignment: "right",
			priority: 60,
			value: t("status.macro"),
			overflowable: true,
		},
		{
			id: "encoding",
			alignment: "right",
			priority: 30,
			value: t("status.encoding"),
			overflowable: true,
		},
		{
			id: "dirty",
			alignment: "right",
			priority: 70,
			value: dirty ? t("status.dirty", { count: 1 }) : t("status.saved"),
			tone: dirty ? "warning" : "success",
			overflowable: true,
		},
	];
	const left = segments.filter((item) => item.alignment === "left");
	const right = segments.filter((item) => item.alignment === "right");

	return (
		<footer
			className="status-bar"
			role="status"
			aria-label={t("workspace.tab.settings")}
		>
			<div className="status-group status-group-left">
				{left.map((item) => (
					<StatusSegment key={item.id} segment={item} onAction={onAction} />
				))}
			</div>
			<div className="status-group status-group-right">
				{right.map((item) => (
					<StatusSegment key={item.id} segment={item} onAction={onAction} />
				))}
				<IconButton
					label={t("status.notifications")}
					className="status-icon"
					onClick={() => onAction?.("notifications.open")}
				>
					<Bell size={14} />
				</IconButton>
			</div>
		</footer>
	);
}

function StatusSegment({
	segment,
	onAction,
}: {
	readonly segment: StatusBarSegment;
	readonly onAction?: (command: string) => void;
}) {
	const content = (
		<>
			<span className="status-segment-icon">{segment.icon}</span>
			{segment.label && <span>{segment.label}</span>}
			<strong>{segment.value}</strong>
		</>
	);
	const className = cn(
		"status-segment",
		`status-tone-${segment.tone ?? "default"}`,
		`status-priority-${segment.priority}`,
	);
	if (segment.command)
		return (
			<button
				type="button"
				className={className}
				title={segment.tooltip}
				onClick={() => onAction?.(segment.command!)}
			>
				{content}
			</button>
		);
	return (
		<span className={className} title={segment.tooltip}>
			{content}
		</span>
	);
}
