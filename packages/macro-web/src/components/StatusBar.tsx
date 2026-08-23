import type {
	CommandDescriptorDto,
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
import {
	useActiveEditorSurface,
	useEditorSurfaceForGlobalUi,
} from "../lib/editor-surface-registry";
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
	readonly commands?: readonly CommandDescriptorDto[];
	readonly onAction?: (command: string) => void;
	readonly onToggleVim?: () => void;
}

/**
 * Status bar that derives Vim presentation from the active editor-surface
 * registry. When no registered surface owns focus (or it is not Vim-enabled),
 * the Vim segment is not shown and no editor-only command is offered. Explicit
 * props override the registry (used by dev fixtures).
 */
export function RegisteredStatusBar(props: StatusBarProps) {
	const active = useActiveEditorSurface();
	const globalSurface = useEditorSurfaceForGlobalUi();
	const vimMode = props.vimMode ?? globalSurface?.mode;
	const vimEnabled = props.vimEnabled ?? globalSurface?.vimEnabled ?? false;
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
			commands={props.commands}
			onToggleVim={props.onToggleVim}
		/>
	);
}

export function getVimCommandLabel(
	text: string | undefined,
	token: string | undefined,
	commands: readonly CommandDescriptorDto[] = [],
	translate: (key: string) => string = (key) => key,
): string {
	const activeToken = token ?? "";
	const raw = (text || "").trim();
	const clean =
		activeToken && raw.startsWith(activeToken)
			? raw.slice(activeToken.length).trim()
			: raw;
	if (!clean) {
		const examples = commands
			.flatMap((command) => [
				...(command.aliases ?? []),
				...(command.verb ? [command.verb] : []),
			])
			.filter((value, index, values) => values.indexOf(value) === index)
			.slice(0, 8);
		if (!activeToken && examples.length === 0) return "";
		return examples.length > 0
			? `${activeToken} [${examples.join(", ")}]`
			: activeToken;
	}
	const normalized = clean.toLowerCase();
	const match = commands.find((command) =>
		[command.id, command.verb, ...(command.aliases ?? [])].some(
			(value) => value?.toLowerCase() === normalized,
		),
	);
	if (match) {
		const translated = match.titleI18nKey
			? translate(match.titleI18nKey)
			: match.id;
		const label = translated === match.titleI18nKey ? match.id : translated;
		return `${activeToken}${clean} → ${label}`;
	}
	return `${activeToken}${clean}`;
}

export function StatusBar({
	vimMode,
	vimEnabled = false,
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
	commands = [],
	onAction,
	onToggleVim,
}: StatusBarProps) {
	const { t } = useI18n();
	const vimLabel = vimEnabled
		? `${t("shell.vim.label" as WebI18nKey)}: ${t(
				vimMode
					? (`shell.mode.${vimMode.toLowerCase()}` as WebI18nKey)
					: ("shell.mode.normal" as WebI18nKey),
			)}`
		: t("shell.vim.disabled" as WebI18nKey);
	const handleAction = (command: string) => {
		if (command === "workbench.toggleVim" && onToggleVim) {
			onToggleVim();
			return;
		}
		onAction?.(command);
	};
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
		{
			id: "vim-toggle",
			alignment: "right" as const,
			priority: 100,
			value: vimLabel,
			icon: <Keyboard size={13} />,
			tone: vimEnabled ? ("accent" as const) : ("default" as const),
			tooltip: vimEnabled ? t("editor.vimEnabled") : t("editor.vimDisabled"),
			command: "workbench.toggleVim",
		},
		...(commandMode
			? [
					{
						id: "vim-command",
						alignment: "right" as const,
						priority: 105,
						value: getVimCommandLabel(
							commandText,
							commandToken,
							commands,
							(key) => t(key as WebI18nKey),
						),
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
					<StatusSegment key={item.id} segment={item} onAction={handleAction} />
				))}
			</div>
			<div className="status-group status-group-right">
				{right.map((item) => (
					<StatusSegment key={item.id} segment={item} onAction={handleAction} />
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
