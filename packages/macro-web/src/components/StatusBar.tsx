import { Bell, BookOpen, Check, CircleAlert, Cloud, GitBranch, Keyboard, WifiOff } from "lucide-react";
import { useI18n } from "../lib/i18n";
import { cn } from "../lib/utils";
import { IconButton } from "./ui/primitives";

export interface StatusBarSegment {
	readonly id: string;
	readonly alignment: "left" | "right";
	readonly priority: number;
	readonly minContainerWidth?: "compact" | "comfortable" | "wide";
	readonly label?: string;
	readonly value?: string;
	readonly icon?: React.ReactNode;
	readonly tone?: "default" | "info" | "success" | "warning" | "danger" | "accent";
	readonly tooltip?: string;
	readonly command?: string;
	readonly overflowable?: boolean;
}

export interface StatusBarProps {
	readonly vimMode?: "NORMAL" | "INSERT" | "VISUAL";
	readonly vimEnabled?: boolean;
	readonly editorFocused?: boolean;
	readonly dirty?: boolean;
	readonly diagnostics?: number;
	readonly connected?: boolean;
	readonly profile?: string;
	readonly domain?: string;
	readonly cursor?: string;
	readonly onAction?: (command: string) => void;
}

export function StatusBar({
	vimMode,
	vimEnabled = false,
	editorFocused = true,
	dirty = false,
	diagnostics = 0,
	connected = true,
	profile = "Clinical",
	domain = "Notes",
	cursor = "Ln 9, Col 1",
	onAction,
}: StatusBarProps) {
	const { t } = useI18n();
	const segments: StatusBarSegment[] = [
		{ id: "connection", alignment: "left", priority: 100, value: connected ? "Local" : "Offline", icon: connected ? <Cloud size={13} /> : <WifiOff size={13} />, tone: connected ? "info" : "danger", command: "host.openDiagnostics" },
		{ id: "profile", alignment: "left", priority: 80, value: profile, icon: <GitBranch size={13} />, command: "workspace.selectProfile", overflowable: true },
		{ id: "domain", alignment: "left", priority: 70, value: domain, icon: <BookOpen size={13} />, command: "domain.open", overflowable: true },
		{ id: "diagnostics", alignment: "left", priority: 100, value: diagnostics ? t("shell.diagnostics.errors", undefined, { count: diagnostics }) : t("status.zeroDiagnostics"), icon: diagnostics ? <CircleAlert size={13} /> : <Check size={13} />, tone: diagnostics ? "danger" : "success", command: "diagnostics.open" },
		...(vimEnabled && editorFocused && vimMode ? [{ id: "vim-mode", alignment: "right" as const, priority: 100, value: t(`shell.mode.${vimMode.toLowerCase()}`), icon: <Keyboard size={13} />, tone: "accent" as const, command: "scratchpad.configureVim" }] : []),
		{ id: "cursor", alignment: "right", priority: 90, value: cursor, overflowable: true },
		{ id: "macro", alignment: "right", priority: 60, value: "Macro", overflowable: true },
		{ id: "encoding", alignment: "right", priority: 30, value: "UTF-8", overflowable: true },
		{ id: "dirty", alignment: "right", priority: 70, value: dirty ? t("settings.status.modified", undefined, { count: 1 }) : t("textEditor.saved"), tone: dirty ? "warning" : "success", overflowable: true },
	];
	const left = segments.filter((item) => item.alignment === "left");
	const right = segments.filter((item) => item.alignment === "right");

	return (
		<footer className="status-bar" role="status" aria-label={t("workspace.tab.settings")}>
			<div className="status-group status-group-left">{left.map((item) => <StatusSegment key={item.id} segment={item} onAction={onAction} />)}</div>
			<div className="status-group status-group-right">
				{right.map((item) => <StatusSegment key={item.id} segment={item} onAction={onAction} />)}
				<IconButton label={t("status.notifications")} className="status-icon" onClick={() => onAction?.("notifications.open")}><Bell size={14} /></IconButton>
			</div>
		</footer>
	);
}

function StatusSegment({ segment, onAction }: { readonly segment: StatusBarSegment; readonly onAction?: (command: string) => void }) {
	const content = <><span className="status-segment-icon">{segment.icon}</span>{segment.label && <span>{segment.label}</span>}<strong>{segment.value}</strong></>;
	const className = cn("status-segment", `status-tone-${segment.tone ?? "default"}`, `status-priority-${segment.priority}`);
	if (segment.command) return <button type="button" className={className} title={segment.tooltip} onClick={() => onAction?.(segment.command!)}>{content}</button>;
	return <span className={className} title={segment.tooltip}>{content}</span>;
}
