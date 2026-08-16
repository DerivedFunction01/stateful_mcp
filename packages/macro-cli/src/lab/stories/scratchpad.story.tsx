import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiTree, type TuiTreeNode } from "../../ui/primitives/TuiTree";
import { TuiNamedColors } from "../../ui/tokens";

export const scratchpadStory: TuiStory = {
	id: "scratchpad",
	title: "Scratchpad Editor & Projections",
	category: "Scratchpad",
	states: ["linear-projections", "tree-projections", "unconfigured-empty", "pinned-macro"],
	render(context) {
		const width = context.size.columns;

		if (context.stateId === "unconfigured-empty") {
			return (
				<box flexDirection="column" padding={1} width={width}>
					<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
						Macro Scratchpad
					</text>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						Author one macro at a time. Preview, validate, and execute from the same surface.
					</text>
					<box height={1} marginTop={1} flexDirection="row">
						<text fg={TuiNamedColors.amber} attributes={TextAttributes.BOLD}>
							[1] 
						</text>
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.INVERSE}>
							{" "}
						</text>
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							{"  "}[no pins]
						</text>
					</box>
					<box marginTop={2}>
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							Tip: Type ^ to trigger macro autocomplete or Ctrl+P for command palette.
						</text>
					</box>
				</box>
			);
		}

		if (context.stateId === "tree-projections") {
			const treeData: readonly TuiTreeNode[] = [
				{
					id: "tree-1",
					label: "1. [v2-differential-active-1] [hg + hp - hg, hp] -> Hunger Games | status: active",
					variant: "accent",
					children: [
						{ id: "t1-c1", label: "+ supporting: Harry Potter", variant: "supporting" },
						{ id: "t1-c2", label: "-- refuting: Hunger Games", variant: "refuting" },
						{ id: "t1-c3", label: "-- refuting: Harry Potter", variant: "refuting" },
					],
				},
				{
					id: "tree-2",
					label: "2. [v2-differential-active-1] [test - hg - hp] -> Test | status: active",
					variant: "accent",
					children: [
						{ id: "t2-c1", label: "-- refuting: Hunger Games", variant: "refuting" },
						{ id: "t2-c2", label: "-- refuting: Harry Potter", variant: "refuting" },
					],
				},
			];

			return (
				<box flexDirection="column" padding={1} width={width}>
					<text fg={TuiNamedColors.amber} attributes={TextAttributes.BOLD}>
						Apply to: New differential branches
					</text>
					<box marginTop={1} flexDirection="column">
						<text fg={TuiNamedColors.primary}>
							[1] hg + hp - hg, hp  [no pins]
						</text>
						<text fg={TuiNamedColors.primary}>
							[2] test - hg - hp    [no pins]
						</text>
					</box>
					<box marginTop={1} marginBottom={1}>
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
							PREVIEW:
						</text>
					</box>
					<TuiTree nodes={treeData} />
				</box>
			);
		}

		if (context.stateId === "pinned-macro") {
			return (
				<box flexDirection="column" padding={1} width={width}>
					<box height={1} marginBottom={1}>
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
							Pinned Macro Active: ^deploy (Alt+P to toggle)
						</text>
					</box>
					<box flexDirection="column">
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.INVERSE}>
							[1] ^deploy service=api env=production [pinned]
						</text>
						<text fg={TuiNamedColors.success}>
							    ↳ Deploying service 'api' to environment 'production' (release-2026.08)
						</text>
					</box>
				</box>
			);
		}

		// Default linear projections
		return (
			<box flexDirection="column" padding={1} width={width}>
				<text fg={TuiNamedColors.primary} attributes={TextAttributes.BOLD}>
					Workspace Scratchpad
				</text>
				<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
					Author one macro at a time. Preview, validate, and execute from the same surface.
				</text>
				<box marginTop={1} flexDirection="column">
					<box flexDirection="column" marginBottom={1}>
						<text fg={TuiNamedColors.primary}>
							01  ^echo message="Hello workspace"       [v]
						</text>
						<text fg={TuiNamedColors.success}>
							    ↳ Hello workspace
						</text>
					</box>
					<box flexDirection="column" marginBottom={1}>
						<text fg={TuiNamedColors.primary} attributes={TextAttributes.INVERSE}>
							02  ^deploy service=api env=staging       [v]
						</text>
						<text fg={TuiNamedColors.success}>
							    ↳ Deploy api to staging
						</text>
					</box>
					<box flexDirection="column">
						<text fg={TuiNamedColors.primary}>
							03  plain text without a macro            [!]
						</text>
						<text fg={TuiNamedColors.warning}>
							    ! Unknown macro or plain text line
						</text>
					</box>
				</box>
			</box>
		);
	},
};
