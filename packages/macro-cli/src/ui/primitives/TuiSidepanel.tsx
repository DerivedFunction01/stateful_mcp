import { TextAttributes } from "@opentui/core";
import type { ReactNode } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export interface TuiSidepanelCard {
	readonly id: string;
	readonly title: string;
	readonly subtitle?: string;
	readonly badge?: string;
	readonly isActive?: boolean;
}

export interface TuiSidepanelProps {
	readonly title: string;
	readonly closeHint?: string;
	readonly width?: number;
	readonly cards?: readonly TuiSidepanelCard[];
	readonly description?: string;
	readonly children?: ReactNode;
	/** Whether this panel currently has keyboard input focus (distinct from being the active/selected panel) */
	readonly isFocused?: boolean;
	readonly theme?: TuiThemeDefinition;
}

/**
 * Modern Sidepanel / Secondary Inspector Panel matching the mockup sketch.
 * Features clean header with close hint, subtle border divider, discrete card elements,
 * and contextual description footer.
 */
export function TuiSidepanel({
	title,
	closeHint = "×",
	width = 30,
	cards,
	description,
	children,
	isFocused = false,
	theme,
}: TuiSidepanelProps) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	// Focused: bright accent color on title and divider
	// Active (not focused): normal fgPrimary title, subtle divider
	const titleColor = isFocused ? c.accentPrimary : c.fgPrimary;
	const dividerColor = isFocused ? c.borderActive : c.borderSubtle;

	return (
		<box
			flexDirection="column"
			width={width}
			backgroundColor={c.bgSurface}
			paddingLeft={2}
			paddingRight={2}
			paddingTop={1}
			paddingBottom={1}
		>
			{/* Panel Header — accent color when focused, normal when just active */}
			<box height={1} flexDirection="row" marginBottom={1}>
				<text fg={titleColor} attributes={TextAttributes.BOLD}>
					{isFocused ? "▌ " : "  "}
					{title}
				</text>
				<box flexGrow={1} />
				<text
					fg={isFocused ? c.fgSecondary : c.fgMuted}
					attributes={TextAttributes.DIM}
				>
					{closeHint}
				</text>
			</box>

			{/* Divider — bright when focused, subtle when active but unfocused */}
			<box height={1} marginBottom={1}>
				<text fg={dividerColor}>{"─".repeat(Math.max(4, width - 4))}</text>
			</box>

			{/* Custom Child Content or Rendered Cards */}
			{children ? (
				<box flexDirection="column" flexGrow={1}>
					{children}
				</box>
			) : (
				<box flexDirection="column" flexGrow={1}>
					{cards?.map((card) => {
						const isSelected = card.isActive;
						const cardBg = isSelected ? c.bgActive : c.bgElevated;
						const borderStyle = "single";
						const borderColor = isSelected ? c.borderActive : c.borderDefault;

						return (
							<box
								key={card.id}
								backgroundColor={cardBg}
								borderStyle={borderStyle}
								borderColor={borderColor}
								flexDirection="column"
								paddingLeft={1}
								paddingRight={1}
								marginBottom={1}
							>
								<box height={1} flexDirection="row">
									<text
										fg={isSelected ? c.fgPrimary : c.fgSecondary}
										attributes={isSelected ? TextAttributes.BOLD : 0}
									>
										{card.title}
									</text>
									{card.badge && (
										<>
											<box flexGrow={1} />
											<text
												fg={c.accentSecondary}
												attributes={TextAttributes.DIM}
											>
												{card.badge}
											</text>
										</>
									)}
								</box>
								{card.subtitle && (
									<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
										{card.subtitle}
									</text>
								)}
							</box>
						);
					})}

					{/* Contextual Description */}
					{description && (
						<box marginTop={1}>
							<text fg={c.fgMuted} attributes={TextAttributes.DIM}>
								{description}
							</text>
						</box>
					)}
				</box>
			)}
		</box>
	);
}
