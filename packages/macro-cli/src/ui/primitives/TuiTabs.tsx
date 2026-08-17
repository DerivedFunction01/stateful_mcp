import { TextAttributes } from "@opentui/core";
import { TuiNamedColors, TuiColors } from "../tokens";

export type TuiTabStatus = "default" | "active" | "dirty" | "error" | "success" | "info";

export interface TuiTabItem {
	readonly id: string;
	readonly label: string;
	readonly icon?: string;
	readonly isDirty?: boolean;
	readonly isCloseable?: boolean;
	readonly status?: TuiTabStatus;
	readonly badge?: string | number;
}

export interface TuiTabsProps {
	readonly tabs: readonly TuiTabItem[];
	readonly activeTabId?: string;
	readonly onSelectTab?: (id: string) => void;
	readonly variant?: "opencode" | "browser" | "vscode" | "minimal";
}

/**
 * Modern Segmented Tab Bar for terminal character cells.
 * Uses a thin vertical accent bar (▎ / ▏) to maximize horizontal density and allow more tabs.
 * - Active: Vibrant Cyan thin bar with elevated background
 * - Inactive: Subtle Dim thin bar with surface background
 * - Dirty: Amber thin bar with dirty bullet
 * - Error: Red thin bar with error status
 */
export function TuiTabs({
	tabs,
	activeTabId,
	variant = "opencode",
}: TuiTabsProps) {
	return (
		<box height={1} overflow="hidden" flexDirection="row" paddingLeft={1}>
			{tabs.map((tab, index) => {
				const isActive = tab.id === activeTabId;
				const effectiveStatus: TuiTabStatus = tab.status ?? (isActive ? "active" : tab.isDirty ? "dirty" : "default");

				let accentColorHex: string;
				let accentColorNamed: string;

				switch (effectiveStatus) {
					case "error":
						accentColorHex = TuiColors.statusError;
						accentColorNamed = TuiNamedColors.error;
						break;
					case "dirty":
						accentColorHex = TuiColors.accentAmber;
						accentColorNamed = TuiNamedColors.amber;
						break;
					case "active":
						accentColorHex = TuiColors.accentCyan;
						accentColorNamed = "cyan";
						break;
					case "success":
						accentColorHex = TuiColors.statusSuccess;
						accentColorNamed = TuiNamedColors.success;
						break;
					case "info":
						accentColorHex = TuiColors.accentBlue;
						accentColorNamed = TuiNamedColors.info;
						break;
					default:
						accentColorHex = TuiColors.borderDim;
						accentColorNamed = TuiNamedColors.border;
						break;
				}

				const iconStr = tab.icon ? `${tab.icon} ` : "";
				const dirtyStr = tab.isDirty ? " ●" : "";
				const badgeStr = tab.badge !== undefined ? ` (${tab.badge})` : "";
				const closeStr = tab.isCloseable ? " ×" : "";
				const labelText = `${iconStr}${tab.label}${badgeStr}${dirtyStr}${closeStr}`;

				// OpenCode variant: compact connected card strip with thin vertical bar (▎)
				if (variant === "opencode") {
					const tabBg = isActive ? TuiColors.bgActive : TuiColors.bgSurface;

					return (
						<box
							key={tab.id}
							flexDirection="row"
							backgroundColor={tabBg}
							paddingRight={1}
						>
							{/* Thin vertical accent bar */}
							<text fg={accentColorHex} attributes={isActive ? TextAttributes.BOLD : 0}>
								▎{" "}
							</text>
							<text
								fg={isActive ? "white" : TuiNamedColors.muted}
								attributes={isActive ? TextAttributes.BOLD : 0}
							>
								{labelText}
							</text>
						</box>
					);
				}

				if (variant === "vscode") {
					return (
						<box key={tab.id} flexDirection="row">
							{index > 0 && <text fg={TuiNamedColors.border}>│</text>}
							<box
								flexDirection="row"
								backgroundColor={isActive ? TuiColors.bgHighlight : undefined}
								paddingLeft={1}
								paddingRight={1}
							>
								{isActive && (
									<text fg="cyan" attributes={TextAttributes.BOLD}>
										▎ 
									</text>
								)}
								<text
									fg={isActive ? "white" : TuiNamedColors.muted}
									attributes={isActive ? TextAttributes.BOLD : 0}
								>
									{labelText}
								</text>
							</box>
						</box>
					);
				}

				if (variant === "minimal") {
					return (
						<box key={tab.id} flexDirection="row" marginRight={1}>
							<text
								fg={isActive ? "white" : TuiNamedColors.muted}
								attributes={isActive ? TextAttributes.BOLD | TextAttributes.INVERSE : 0}
							>
								{" "}{labelText}{" "}
							</text>
						</box>
					);
				}

				// Default "browser" card style
				if (isActive || tab.status === "error" || tab.status === "dirty") {
					return (
						<box
							key={tab.id}
							flexDirection="row"
							marginRight={1}
							backgroundColor={TuiColors.bgHighlight}
						>
							<text fg={accentColorNamed}>╭ </text>
							<text
								fg="white"
								attributes={isActive ? TextAttributes.BOLD : 0}
							>
								{labelText}
							</text>
							<text fg={accentColorNamed}> ╮</text>
						</box>
					);
				}

				return (
					<box
						key={tab.id}
						flexDirection="row"
						marginRight={1}
						backgroundColor={TuiColors.bgDark}
					>
						<text fg={TuiNamedColors.muted}>
							{"  "}{labelText}{"  "}
						</text>
					</box>
				);
			})}
			<box flexGrow={1} />
		</box>
	);
}
