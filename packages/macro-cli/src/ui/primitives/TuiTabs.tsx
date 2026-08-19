import { type MouseEvent, TextAttributes } from "@opentui/core";
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
	readonly onMouseDown?: (tabId: string, event: MouseEvent) => void;
	readonly rowHeight?: 1 | 2;
	readonly theme?: TuiThemeDefinition;
}

/**
 * Modern Segmented Tab Bar for terminal character cells.
 * Seamlessly themed with zero gaps and thin vertical accent indicators (▎).
 */
export function TuiTabs({
	tabs,
	activeTabId,
	onSelectTab,
	onMouseDown,
	rowHeight = 1,
	theme,
}: TuiTabsProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const activeId = activeTabId ?? tabs[0]?.id;

	return (
		<box height={rowHeight} flexDirection="row" alignItems="center">
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
						height={rowHeight}
						alignItems="center"
						flexDirection="row"
						paddingLeft={0}
						paddingRight={1}
						marginRight={0}
						onMouseDown={(event) => {
							if (event.button === 0) {
								onSelectTab?.(tab.id);
								onMouseDown?.(tab.id, event);
							}
						}}
					>
						{/* Full-height tab accent. */}
						<box
							width={1}
							height={rowHeight}
							backgroundColor={
								isActive || isDirty || status !== "default"
									? accentColor
									: c.borderSubtle
							}
						/>

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
