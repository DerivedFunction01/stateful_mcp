import { type MouseEvent, TextAttributes } from "@opentui/core";
import { useState } from "react";
import { GlobalThemeRegistry, type TuiThemeDefinition } from "../theme";

export interface TuiMenuItem {
	readonly id: string;
	readonly label: string;
	readonly shortcut?: string;
	readonly onSelect?: () => void;
}
export interface TuiMenuGroup {
	readonly id: string;
	readonly label: string;
	readonly items: readonly TuiMenuItem[];
}

export function TuiMenuBar({
	groups,
	width,
	theme,
	compact = false,
}: {
	groups: readonly TuiMenuGroup[];
	width?: number;
	theme?: TuiThemeDefinition;
	compact?: boolean;
}) {
	const c = (theme ?? GlobalThemeRegistry.getActive()).colors;
	const [openId, setOpenId] = useState<string | null>(null);
	return (
		<box
			height={1}
			width={width ?? "100%"}
			flexDirection="row"
			backgroundColor={c.bgSurface}
		>
			{groups.map((group) => {
				const isOpen = openId === group.id;
				return (
					<box
						key={group.id}
						paddingLeft={1}
						paddingRight={1}
						backgroundColor={isOpen ? c.bgActive : c.bgSurface}
						onMouseDown={(event: MouseEvent) => {
							if (event.button === 0) setOpenId(isOpen ? null : group.id);
						}}
					>
						<text
							fg={isOpen ? c.fgPrimary : c.fgMuted}
							attributes={isOpen ? TextAttributes.BOLD : 0}
						>
							{compact ? group.label.slice(0, 1) : group.label}
						</text>
						{isOpen && (
							<box
								position="absolute"
								top={1}
								left={0}
								flexDirection="column"
								backgroundColor={c.bgElevated}
								borderStyle="single"
								borderColor={c.borderActive}
							>
								{group.items.map((item) => (
									<box
										key={item.id}
										paddingLeft={1}
										paddingRight={1}
										flexDirection="row"
										onMouseDown={(itemEvent: MouseEvent) => {
											if (itemEvent.button === 0) {
												item.onSelect?.();
												setOpenId(null);
											}
										}}
									>
										<text fg={c.fgPrimary}>{item.label}</text>
										{item.shortcut && (
											<text fg={c.fgMuted}> {item.shortcut}</text>
										)}
									</box>
								))}
							</box>
						)}
					</box>
				);
			})}
		</box>
	);
}
