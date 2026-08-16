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
 * Features a seamless connected tab strip with zero gaps:
 * - Active: Vibrant Cyan accent bar with elevated background
 * - Inactive: Subtle Dim Border accent bar with surface background
 * - Dirty: Amber accent bar with dirty bullet
 * - Error: Red accent bar with error status
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
						// Subtle border for inactive tabs to maintain uniform layout and visual framing
						accentColorHex = TuiColors.borderDim;
						accentColorNamed = TuiNamedColors.border;
						break;
				}

				const iconStr = tab.icon ? `${tab.icon} ` : "";
				const dirtyStr = tab.isDirty ? " ●" : "";
				const badgeStr = tab.badge !== undefined ? ` (${tab.badge})` : "";
				const closeStr = tab.isCloseable ? " ×" : "";
				const labelText = `${iconStr}${tab.label}${badgeStr}${dirtyStr}${closeStr}`;

				// OpenCode variant: connected tab strip with zero gap between tabs
				if (variant === "opencode") {
					const tabBg = isActive ? TuiColors.bgActive : TuiColors.bgSurface;

					return (
						<box
							key={tab.id}
							flexDirection="row"
							backgroundColor={tabBg}
						>
							{/* Left accent / border column (creates seamless boundary between connected tabs) */}
							<box
								width={1}
								backgroundColor={accentColorHex}
							/>
							<box paddingLeft={1} paddingRight={1}>
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
