import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiNamedColors } from "../../ui/tokens";

export const activityRailStory: TuiStory = {
	id: "activity-rail",
	title: "Activity Rail Navigation",
	category: "Core",
	states: ["first-active", "second-active", "custom-icons"],
	render(context) {
		const activeId = context.stateId === "second-active" ? "2" : "1";

		const items = [
			{ id: "1", altKey: "1", icon: "📝", label: "Scratchpad" },
			{ id: "2", altKey: "2", icon: "🔍", label: "Explorer" },
			{ id: "3", altKey: "3", icon: "🕒", label: "Journal" },
			{ id: "4", altKey: "4", icon: "⚙️", label: "Settings" },
		];

		return (
			<box flexDirection="row">
				<box
					flexDirection="column"
					width={6}
					borderStyle="single"
					borderColor={TuiNamedColors.border}
					paddingLeft={1}
				>
					{items.map((item) => {
						const isActive = item.id === activeId;
						return (
							<box key={item.id} height={1} marginBottom={1}>
								<text
									attributes={isActive ? TextAttributes.INVERSE | TextAttributes.BOLD : 0}
									fg={isActive ? "cyan" : TuiNamedColors.primary}
								>
									{item.altKey} {item.icon}
								</text>
							</box>
						);
					})}
				</box>
				<box paddingLeft={2} flexDirection="column">
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						Activity Rail Info
					</text>
					<text fg={TuiNamedColors.muted}>
						Active Container: {items.find((i) => i.id === activeId)?.label}
					</text>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						Press Alt+1..4 to navigate between workspace activity views.
					</text>
				</box>
			</box>
		);
	},
};
