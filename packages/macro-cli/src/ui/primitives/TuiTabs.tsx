import { TextAttributes } from "@opentui/core";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export type TuiTabStatus =
	| "default"
	| "active"
	| "dirty"
	| "error"
	| "success"
	| "info";

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
	readonly theme?: TuiThemeDefinition;
}

/**
 * Modern Segmented Tab Bar for terminal character cells.
 * Seamlessly themed with zero gaps and thin vertical accent indicators (▎).
 */
export function TuiTabs({
	tabs,
	activeTabId,
	variant = "opencode",
	theme,
}: TuiTabsProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const activeId = activeTabId ?? tabs[0]?.id;

	return (
		<box height={1} flexDirection="row">
			{tabs.map((tab) => {
				const isActive = tab.id === activeId;
				const isDirty = tab.isDirty;
				const status = tab.status ?? "default";

				// Background color by active state from theme
				const bg = isActive ? c.bgActive : c.bgSurface;

				// Status accent color from theme
				const accentColor =
					status === "error"
						? c.statusError
						: status === "success"
							? c.statusSuccess
							: isDirty
								? c.statusWarning
								: isActive
									? c.accentPrimary
									: c.borderSubtle;

				const labelColor = isActive ? c.fgPrimary : c.fgMuted;

				return (
					<box
						key={tab.id}
						backgroundColor={bg}
						flexDirection="row"
						paddingLeft={0}
						paddingRight={1}
						marginRight={0}
					>
						{/* Thin vertical accent bar */}
						<text fg={accentColor} attributes={TextAttributes.BOLD}>
							▎
						</text>

						{/* Icon if provided */}
						{tab.icon && (
							<text fg={isActive ? c.accentPrimary : c.fgMuted}>
								{" "}
								{tab.icon}
							</text>
						)}

						{/* Tab Label */}
						<text
							fg={labelColor}
							attributes={isActive ? TextAttributes.BOLD : 0}
						>
							{" "}
							{tab.label}
						</text>

						{/* Badge / Count */}
						{tab.badge !== undefined && (
							<text fg={c.accentSecondary} attributes={TextAttributes.DIM}>
								{" "}
								({tab.badge})
							</text>
						)}

						{/* Dirty Indicator */}
						{isDirty && (
							<text fg={c.statusWarning} attributes={TextAttributes.BOLD}>
								{" "}
								●
							</text>
						)}

						{/* Close button if closable */}
						{tab.isCloseable && (
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								{" "}
								×
							</text>
						)}
					</box>
				);
			})}
		</box>
	);
}
