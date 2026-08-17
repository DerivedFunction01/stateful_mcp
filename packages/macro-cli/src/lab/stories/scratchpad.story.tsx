import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiTree, type TuiTreeNode } from "../../ui/primitives/TuiTree";
import { TuiColors, TuiNamedColors } from "../../ui/tokens";

export const scratchpadStory: TuiStory = {
	id: "scratchpad",
	title: "Scratchpad Editor & Projections",
	category: "Scratchpad",
	states: [
		"unified-gutter-card",
		"clinical-tree-unified",
		"diagnostic-cell-unified",
		"pinned-macro-unified",
	],
	render(context) {
		const width = context.size.columns;

		// 1. Unified Gutter Card: Left Accent Pillar + Line Number Gutter + Right Pipe + Indented Projection + Bottom Space
		if (context.stateId === "unified-gutter-card") {
			const lines = [
				{
					num: "01",
					sign: "✓",
					text: "^echo message=\"Hello workspace\"",
					projection: "↳ Hello workspace (compiled output)",
					isValid: true,
					isActive: false,
				},
				{
					num: "02",
					sign: "●",
					text: "^deploy service=api env=staging region=us-east-1",
					projection: "↳ Deploying service 'api' to environment 'staging' [ready]",
					isValid: true,
					isActive: true,
				},
				{
					num: "03",
					sign: "!",
					text: "plain text item awaiting macro compilation",
					projection: "! Unknown macro or missing required parameters",
					isValid: false,
					isActive: false,
				},
			];

			return (
				<box flexDirection="column" padding={1} width={width}>
					{lines.map((line) => {
						const rowBg = line.isActive ? TuiColors.bgHighlight : undefined;

						return (
							<box key={line.num} flexDirection="column" marginBottom={1}>
								{/* Main Code Line with Left Accent + Sign + Number + Pipe */}
								<box flexDirection="row" backgroundColor={rowBg}>
									{/* Left accent bar */}
									<text
										fg={line.isActive ? "cyan" : "transparent"}
										attributes={TextAttributes.BOLD}
									>
										{line.isActive ? "▎" : " "}
									</text>

									{/* Sign column indicator */}
									<text
										fg={
											line.isActive
												? "cyan"
												: line.sign === "!"
													? "red"
													: line.sign === "✓"
														? "green"
														: TuiNamedColors.muted
										}
										attributes={TextAttributes.BOLD}
									>
										{" "}{line.sign}{" "}
									</text>

									{/* Line number */}
									<text
										fg={line.isActive ? "yellow" : TuiNamedColors.muted}
										attributes={line.isActive ? TextAttributes.BOLD : 0}
									>
										{line.num}{" "}
									</text>

									{/* Right pipe separator */}
									<text fg={TuiNamedColors.border}>│ </text>

									{/* Input Command Content */}
									<text
										fg={line.isActive ? "white" : TuiNamedColors.primary}
										attributes={line.isActive ? TextAttributes.BOLD : 0}
									>
										{line.text}
									</text>
								</box>

								{/* Connected Projection Row with aligned pipe */}
								<box flexDirection="row">
									<text fg="transparent"> </text>
									<text fg="transparent">   </text>
									<text fg="transparent">   </text>
									<text fg={TuiNamedColors.border}>│ </text>
									<text
										fg={
											line.isValid
												? TuiNamedColors.success
												: TuiNamedColors.error
										}
									>
										{line.projection}
									</text>
								</box>
							</box>
						);
					})}
				</box>
			);
		}

		// 2. Clinical Tree Unified: Connected Hierarchical Differentials with Gutter & Pipe
		if (context.stateId === "clinical-tree-unified") {
			const treeNodes: readonly TuiTreeNode[] = [
				{
					id: "node-1",
					label: "+ supporting: Lisinopril 20mg oral daily (BP normalized to 120/80)",
					variant: "supporting",
				},
				{
					id: "node-2",
					label: "— refuting: Atenolol 50mg (contraindicated by asthma history)",
					variant: "refuting",
				},
			];

			return (
				<box flexDirection="column" padding={1} width={width}>
					<box height={1} marginBottom={1} flexDirection="row">
						<text fg={TuiNamedColors.amber} attributes={TextAttributes.BOLD}>
							Context: Clinical Decision Support
						</text>
						<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
							{"  "}[patient: PT-9042]
						</text>
					</box>

					{/* Cell 1 (Active) */}
					<box flexDirection="column" marginBottom={1}>
						<box flexDirection="row" backgroundColor={TuiColors.bgHighlight}>
							<text fg="cyan" attributes={TextAttributes.BOLD}>▎ </text>
							<text fg="cyan" attributes={TextAttributes.BOLD}>● </text>
							<text fg="yellow" attributes={TextAttributes.BOLD}>01 </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg="white" attributes={TextAttributes.BOLD}>
								@differential hypertension_stage_2
							</text>
						</box>

						{/* Projection Tree indented under the right pipe */}
						<box flexDirection="row" marginTop={1}>
							<text fg="transparent">       </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<TuiTree nodes={treeNodes} />
						</box>
					</box>

					{/* Cell 2 (Inactive) */}
					<box flexDirection="column" marginBottom={1}>
						<box flexDirection="row">
							<text fg="transparent">▎ </text>
							<text fg="green" attributes={TextAttributes.BOLD}>✓ </text>
							<text fg={TuiNamedColors.muted}>02 </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg={TuiNamedColors.primary}>
								@plan schedule_followup in=2_weeks
							</text>
						</box>
						<box flexDirection="row">
							<text fg="transparent">       </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg={TuiNamedColors.success}>
								↳ Appointment booked: 2026-08-30 with Dr. Martinez
							</text>
						</box>
					</box>
				</box>
			);
		}

		// 3. Diagnostic Cell Unified: Rich Error Diagnostics with Sign Column
		if (context.stateId === "diagnostic-cell-unified") {
			return (
				<box flexDirection="column" padding={1} width={width}>
					<box flexDirection="column" marginBottom={1}>
						<box flexDirection="row" backgroundColor={TuiColors.bgHighlight}>
							<text fg="red" attributes={TextAttributes.BOLD}>▎ </text>
							<text fg="red" attributes={TextAttributes.BOLD}>! </text>
							<text fg="yellow" attributes={TextAttributes.BOLD}>01 </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg="white" attributes={TextAttributes.BOLD}>
								^charge amount=NaN currency=USD
							</text>
						</box>
						<box flexDirection="row">
							<text fg="transparent">       </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg={TuiNamedColors.error} attributes={TextAttributes.BOLD}>
								! Error: Parameter 'amount' must be a positive decimal number.
							</text>
						</box>
					</box>
				</box>
			);
		}

		// 4. Pinned Macro Unified: Top Pinned Bar + Unified Gutter Line Layout
		return (
			<box flexDirection="column" padding={1} width={width}>
				{/* Top Pinned Macro Badge */}
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						📌 PINNED: @medication
					</text>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						{"  "}(Press Alt+P to unpin)
					</text>
				</box>

				<box flexDirection="column" marginBottom={1}>
					<box flexDirection="row" backgroundColor={TuiColors.bgHighlight}>
						<text fg="cyan" attributes={TextAttributes.BOLD}>▎ </text>
						<text fg="cyan" attributes={TextAttributes.BOLD}>● </text>
						<text fg="yellow" attributes={TextAttributes.BOLD}>01 </text>
						<text fg={TuiNamedColors.border}>│ </text>
						<text fg="white" attributes={TextAttributes.BOLD}>
							lisinopril 20mg oral daily
						</text>
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.DIM}>
							{"  "}[pinned to @medication]
						</text>
					</box>
					<box flexDirection="row">
						<text fg="transparent">       </text>
						<text fg={TuiNamedColors.border}>│ </text>
						<text fg={TuiNamedColors.success}>
							↳ Rx: Lisinopril 20mg | Route: Oral | Sig: 1 tab daily | Refills: 3
						</text>
					</box>
				</box>
			</box>
		);
	},
};
