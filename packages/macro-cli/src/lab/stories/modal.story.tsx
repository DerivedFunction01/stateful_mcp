import { TextAttributes } from "@opentui/core";
import { TuiButton } from "../../ui/primitives/TuiButton";
import { TuiModal } from "../../ui/primitives/TuiModal";
import { TuiProgressBar } from "../../ui/primitives/TuiProgressBar";
import { GlobalThemeRegistry } from "../../ui/theme";
import type { TuiStory } from "../story-contract";

export const modalStory: TuiStory = {
	id: "modal",
	title: "Modal Windows & Dialogs",
	category: "Modals",
	states: [
		"confirmation-dialog",
		"payment-checkout",
		"alert-error",
		"wizard-deploy",
	],
	render(context) {
		const width = Math.min(62, context.size.columns - 4);
		const theme = GlobalThemeRegistry.getActive();
		const c = theme.colors;

		// 1. CONFIRMATION DIALOG (Default — Balanced Equal-Sized Action Buttons)
		if (context.stateId === "confirmation-dialog") {
			return (
				<TuiModal
					title="Discard Unsaved Changes?"
					icon="❓"
					subtitle="Scratchpad buffer has unsaved edits"
					dismissHint="Esc"
					width={width}
					theme={theme}
					footer={
						<box flexDirection="row" alignItems="center">
							<TuiButton
								label="Keep Editing"
								shortcut="Esc"
								variant="outline-to-solid"
								width={22}
								theme={theme}
							/>
							<box width={2} />
							<TuiButton
								label="Discard & Revert"
								shortcut="Enter"
								variant="outline-to-solid"
								intent="danger"
								isSelected={true}
								width={22}
								theme={theme}
							/>
						</box>
					}
				>
					<box flexDirection="column">
						<text fg={c.fgPrimary}>
							Are you sure you want to discard your draft session?
						</text>
						<text fg={c.fgDim} attributes={TextAttributes.DIM} marginTop={1}>
							All 3 pending macro cell modifications will be lost permanently.
						</text>
					</box>
				</TuiModal>
			);
		}

		// 2. PAYMENT CHECKOUT MODAL
		if (context.stateId === "payment-checkout") {
			const cardWidth = width - 4;
			return (
				<TuiModal
					title="Payment Checkout"
					icon="💳"
					subtitle="Order #4092-A · Total: $49.50"
					dismissHint="Esc"
					width={width}
					theme={theme}
					footer={
						<box flexDirection="row" alignItems="center">
							<TuiButton
								label="Cancel"
								shortcut="Esc"
								variant="outline-to-solid"
								width={22}
								theme={theme}
							/>
							<box width={2} />
							<TuiButton
								label="Confirm & Pay"
								shortcut="Enter"
								variant="outline-to-solid"
								intent="success"
								isSelected={true}
								width={22}
								theme={theme}
							/>
						</box>
					}
				>
					<box flexDirection="column">
						<box marginBottom={1}>
							<text fg={c.accentPrimary} attributes={TextAttributes.BOLD}>
								Select Payment Method:
							</text>
						</box>
						<box flexDirection="column">
							<TuiButton
								label="Credit Card (•••• 9841)"
								variant="outline-to-solid"
								isSelected={true}
								width={cardWidth}
								align="left"
								theme={theme}
							/>
							<box height={1} />
							<TuiButton
								label="Cash / Check"
								variant="outline-to-solid"
								width={cardWidth}
								align="left"
								theme={theme}
							/>
							<box height={1} />
							<TuiButton
								label="Apple Pay / Mobile Wallet"
								variant="outline-to-solid"
								width={cardWidth}
								align="left"
								theme={theme}
							/>
						</box>
					</box>
				</TuiModal>
			);
		}

		// 3. ALERT / ERROR DIALOG
		if (context.stateId === "alert-error") {
			return (
				<TuiModal
					title="Execution Failure"
					icon="⚠"
					subtitle="Macro runtime exception"
					dismissHint="Esc"
					variant="alert"
					width={width}
					theme={theme}
					footer={
						<box flexDirection="row" alignItems="center">
							<TuiButton
								label="Dismiss"
								shortcut="Esc"
								variant="outline-to-solid"
								width={20}
								theme={theme}
							/>
							<box width={2} />
							<TuiButton
								label="Retry Action"
								shortcut="Enter"
								variant="outline-to-solid"
								intent="danger"
								isSelected={true}
								width={20}
								theme={theme}
							/>
						</box>
					}
				>
					<box flexDirection="column">
						<text fg={c.statusError} attributes={TextAttributes.BOLD}>
							Extension 'retail.checkout' failed to execute:
						</text>
						<text fg={c.fgMuted} attributes={TextAttributes.DIM} marginTop={1}>
							HTTP 500: Internal server error while provisioning token.
						</text>
					</box>
				</TuiModal>
			);
		}

		// 4. WIZARD STEP MODAL
		const optionWidth = width - 4;
		return (
			<TuiModal
				title="Deploy Pipeline Wizard"
				icon="🚀"
				subtitle="Step 2 of 4: Environment Target"
				dismissHint="Esc"
				width={width}
				theme={theme}
				footer={
					<box flexDirection="row" alignItems="center">
						<TuiButton
							label="Back"
							variant="outline-to-solid"
							width={16}
							theme={theme}
						/>
						<box width={2} />
						<TuiButton
							label="Next: Target"
							shortcut="Enter"
							variant="outline-to-solid"
							intent="primary"
							isSelected={true}
							width={20}
							theme={theme}
						/>
					</box>
				}
			>
				<box flexDirection="column">
					<TuiProgressBar
						value={50}
						total={100}
						label="Deployment Configuration Progress"
						width={width - 8}
						variant="continuous"
						theme={theme}
					/>
					<box marginTop={1} marginBottom={1} flexDirection="column">
						<text fg={c.fgPrimary} attributes={TextAttributes.BOLD}>
							Select Target Cluster:
						</text>
						<box marginTop={1} flexDirection="column">
							<TuiButton
								label="Staging (us-east-1a)"
								variant="outline-to-solid"
								isSelected={true}
								width={optionWidth}
								align="left"
								theme={theme}
							/>
							<box height={1} />
							<TuiButton
								label="Production (us-west-2b)"
								variant="outline-to-solid"
								intent="warning"
								width={optionWidth}
								align="left"
								theme={theme}
							/>
						</box>
					</box>
				</box>
			</TuiModal>
		);
	},
};
