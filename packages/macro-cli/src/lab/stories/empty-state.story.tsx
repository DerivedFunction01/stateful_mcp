import { TextAttributes } from "@opentui/core";
import { TuiNamedColors } from "../../ui/tokens";
import type { TuiStory } from "../story-contract";

export const emptyStateStory: TuiStory = {
	id: "empty-state",
	title: "OpenCode-Inspired Empty State",
	category: "Core",
	states: ["start-screen", "no-extensions", "blank-workspace"],
	render(context) {
		const width = Math.min(64, context.size.columns - 4);

		return (
			<box flexDirection="column" padding={2} width={width}>
				{/* Logo / Header */}
				<box height={1} marginBottom={1}>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						█▀▄▀█ ▄▀█ █▀▀ █▀█ █▀█ ▄▄ █▀▀ █░░ █
					</text>
				</box>
				<box height={1} marginBottom={2}>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						Stateful Macro Terminal Environment
					</text>
				</box>

				{/* Central Prompt Box */}
				<box
					borderStyle="single"
					borderColor="cyan"
					padding={1}
					flexDirection="column"
					marginBottom={1}
				>
					<box flexDirection="row">
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
							&gt;
						</text>
						<text fg={TuiNamedColors.muted}>
							{" "}
							Type ^ for macro suggestions, or author a scratchpad item...
						</text>
					</box>
				</box>

				{/* Shortcut hints */}
				<box height={1} flexDirection="row" marginBottom={2}>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						tab
					</text>
					<text fg={TuiNamedColors.muted}> workspace tabs </text>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						ctrl+p
					</text>
					<text fg={TuiNamedColors.muted}> command palette</text>
				</box>

				{/* Helpful Tip */}
				<box height={1} flexDirection="row">
					<text fg={TuiNamedColors.amber} attributes={TextAttributes.BOLD}>
						● Tip:{" "}
					</text>
					<text fg={TuiNamedColors.muted}>
						Run with --inspect=gallery to test individual components in
						isolation.
					</text>
				</box>
			</box>
		);
	},
};
