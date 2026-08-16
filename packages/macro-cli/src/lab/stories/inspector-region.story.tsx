import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiBadge } from "../../ui/primitives/TuiBadge";
import { TuiDivider } from "../../ui/primitives/TuiDivider";
import { TuiPanel } from "../../ui/primitives/TuiPanel";
import { TuiNamedColors } from "../../ui/tokens";

export const inspectorRegionStory: TuiStory = {
	id: "inspector-region",
	title: "Inspector Region & View Rail",
	category: "Views",
	states: ["follow-mode", "pinned-mode", "empty-inspector"],
	render(context) {
		const width = Math.max(28, Math.floor(context.size.columns * 0.35));
		const isPinned = context.stateId === "pinned-mode";
		const isEmpty = context.stateId === "empty-inspector";

		return (
			<TuiPanel
				width={width}
				title="INSPECTOR"
				subtitle={isPinned ? "PINNED" : "EXPLORER · FOLLOW"}
				headerRight={<TuiBadge label={isPinned ? "PINNED" : "FOLLOW"} variant={isPinned ? "warning" : "info"} />}
			>
				<box borderStyle="single" borderColor={TuiNamedColors.border} padding={1} flexDirection="column">
					{isEmpty ? (
						<box flexDirection="column">
							<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
								Branch Inspector
							</text>
							<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM} marginTop={1}>
								Select a branch or cell to inspect details.
							</text>
						</box>
					) : (
						<box flexDirection="column">
							<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
								Macro Node Details
							</text>
							<text fg={TuiNamedColors.muted}>
								Identifier: ^deploy
							</text>
							<text fg={TuiNamedColors.muted}>
								Namespace: core.deployment
							</text>
							<box marginTop={1} marginBottom={1}>
								<TuiDivider label="Slots & Values" />
							</box>
							<text fg={TuiNamedColors.success}>
								• service: api (valid)
							</text>
							<text fg={TuiNamedColors.success}>
								• env: staging (valid)
							</text>
						</box>
					)}
				</box>
			</TuiPanel>
		);
	},
};
