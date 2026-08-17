import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiTree, type TuiTreeNode } from "../../ui/primitives/TuiTree";
import { TuiColors, TuiNamedColors } from "../../ui/tokens";

export const scratchpadStory: TuiStory = {
	id: "scratchpad",
	title: "Scratchpad Editor & Projections",
	category: "Scratchpad",
	states: [
		"fixed-2row-rhythm",
		"clinical-tree-unified",
		"diagnostic-cell-unified",
		"pinned-macro-unified",
	],
	render(context) {
		const width = context.size.columns;

		// 1. Fixed 2-Row Rhythm: Perfectly aligned vertical pipe at 7 characters
		if (context.stateId === "fixed-2row-rhythm") {
			const lines = [
				{
					num: "01",
					sign: "●",
					text: "^deploy service=api env=staging region=us-east-1",
					projection: "↳ Deploying service 'api' to environment 'staging' [ready]",
					isValid: true,
					isActive: true,
				},
				{
					num: "02",
					sign: " ",
					text: "",
					projection: "",
					isValid: false,
					isActive: false,
				},
				{
					num: "03",
					sign: " ",
					text: "",
					projection: "",
					isValid: false,
					isActive: false,
				},
			];

			return (
				<box flexDirection="column" padding={1} width={width}>
					{lines.map((line) => {
						const rowBg = line.isActive ? TuiColors.bgHighlight : undefined;
						const leftColor = line.isActive ? "cyan" : "transparent";

						return (
							<box key={line.num} flexDirection="column">
								{/* Row 1: Command input (1 char pillar + 3 chars sign + 3 chars lineNum = 7 chars before pipe) */}
								<box flexDirection="row" backgroundColor={rowBg} height={1}>
									<text fg={leftColor} attributes={TextAttributes.BOLD}>
										{line.isActive ? "▎" : " "}
									</text>
									<text
										fg={line.isActive ? "cyan" : TuiNamedColors.muted}
										attributes={TextAttributes.BOLD}
									>
										{" "}{line.sign}{" "}
									</text>
									<text
										fg={line.isActive ? "yellow" : TuiNamedColors.muted}
										attributes={line.isActive ? TextAttributes.BOLD : 0}
									>
										{line.num}{" "}
									</text>
									<text fg={TuiNamedColors.border}>│ </text>
									<text
										fg={line.isActive ? "white" : TuiNamedColors.primary}
										attributes={line.isActive ? TextAttributes.BOLD : 0}
									>
										{line.text || " "}
									</text>
								</box>

								{/* Row 2: Fixed-height projection tray (1 char pillar + 6 chars space = 7 chars before pipe) */}
								<box flexDirection="row" backgroundColor={rowBg} height={1}>
									<text fg={leftColor} attributes={TextAttributes.BOLD}>
										{line.isActive ? "▎" : " "}
									</text>
									<text fg="transparent">      </text>
									<text fg={TuiNamedColors.border}>│ </text>
									{line.projection ? (
										<text fg={line.isValid ? TuiNamedColors.success : TuiNamedColors.error}>
											{line.projection}
										</text>
									) : (
										<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
											{" "}
										</text>
									)}
								</box>
							</box>
						);
					})}
				</box>
			);
		}

		// 2. Clinical Tree Unified
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
					<box flexDirection="column">
						<box flexDirection="row" backgroundColor={TuiColors.bgHighlight} height={1}>
							<text fg="cyan" attributes={TextAttributes.BOLD}>▎ </text>
							<text fg="cyan" attributes={TextAttributes.BOLD}>● </text>
							<text fg="yellow" attributes={TextAttributes.BOLD}>01 </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg="white" attributes={TextAttributes.BOLD}>
								@differential hypertension_stage_2
							</text>
						</box>
						<box flexDirection="row" backgroundColor={TuiColors.bgHighlight} paddingTop={1} paddingBottom={1}>
							<text fg="cyan" attributes={TextAttributes.BOLD}>▎ </text>
							<text fg="transparent">     </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<TuiTree nodes={treeNodes} />
						</box>
					</box>

					{/* Cell 2 (Inactive) */}
					<box flexDirection="column">
						<box flexDirection="row" height={1}>
							<text fg="transparent">▎ </text>
							<text fg="green" attributes={TextAttributes.BOLD}>✓ </text>
							<text fg={TuiNamedColors.muted}>02 </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg={TuiNamedColors.primary}>
								@plan schedule_followup in=2_weeks
							</text>
						</box>
						<box flexDirection="row" height={1}>
							<text fg="transparent">▎ </text>
							<text fg="transparent">     </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg={TuiNamedColors.success}>
								↳ Appointment booked: 2026-08-30 with Dr. Martinez
							</text>
						</box>
					</box>
				</box>
			);
		}

		// 3. Diagnostic Cell Unified
		if (context.stateId === "diagnostic-cell-unified") {
			return (
				<box flexDirection="column" padding={1} width={width}>
					<box flexDirection="column">
						<box flexDirection="row" backgroundColor={TuiColors.bgHighlight} height={1}>
							<text fg="red" attributes={TextAttributes.BOLD}>▎ </text>
							<text fg="red" attributes={TextAttributes.BOLD}>! </text>
							<text fg="yellow" attributes={TextAttributes.BOLD}>01 </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg="white" attributes={TextAttributes.BOLD}>
								^charge amount=NaN currency=USD
							</text>
						</box>
						<box flexDirection="row" backgroundColor={TuiColors.bgHighlight} height={1}>
							<text fg="red" attributes={TextAttributes.BOLD}>▎ </text>
							<text fg="transparent">      </text>
							<text fg={TuiNamedColors.border}>│ </text>
							<text fg={TuiNamedColors.error} attributes={TextAttributes.BOLD}>
								! Error: Parameter 'amount' must be a positive decimal number.
							</text>
						</box>
					</box>
				</box>
			);
		}

		// 4. Pinned Macro Unified
		return (
			<box flexDirection="column" padding={1} width={width}>
				<box height={1} marginBottom={1} flexDirection="row">
					<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
						📌 PINNED: @medication
					</text>
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						{"  "}(Press Alt+P to unpin)
					</text>
				</box>

				<box flexDirection="column">
					<box flexDirection="row" backgroundColor={TuiColors.bgHighlight} height={1}>
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
					<box flexDirection="row" backgroundColor={TuiColors.bgHighlight} height={1}>
						<text fg="cyan" attributes={TextAttributes.BOLD}>▎ </text>
						<text fg="transparent">      </text>
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
