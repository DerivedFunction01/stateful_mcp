import { TextAttributes } from "@opentui/core";
import type { TuiStory } from "../story-contract";
import { TuiButton } from "../../ui/primitives/TuiButton";
import { TuiModal } from "../../ui/primitives/TuiModal";
import { TuiNamedColors } from "../../ui/tokens";

export const modalStory: TuiStory = {
	id: "modal",
	title: "Modal Windows",
	category: "Modals",
	states: ["confirmation-dialog", "payment-checkout", "alert-error"],
	render(context) {
		const width = Math.min(56, context.size.columns - 4);

		if (context.stateId === "payment-checkout") {
			return (
				<TuiModal title="Payment Checkout" dismissHint="esc" width={width}>
					<box flexDirection="column">
						<text fg={TuiNamedColors.primary}>Order: #4092-A</text>
						<text fg={TuiNamedColors.primary}>Total Amount: $49.50</text>
						<box height={1} marginTop={1} marginBottom={1}>
							<text fg={TuiNamedColors.border}>{"─".repeat(width - 4)}</text>
						</box>
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
							Select Payment Method:
						</text>
						<box marginTop={1} flexDirection="row">
							<TuiButton label="Credit Card" isFocused={true} />
							<text> </text>
							<TuiButton label="Cash" />
							<text> </text>
							<TuiButton label="Gift Card" />
						</box>
					</box>
				</TuiModal>
			);
		}

		if (context.stateId === "alert-error") {
			return (
				<TuiModal title="Execution Error" dismissHint="esc" width={width} borderColor="red">
					<box flexDirection="column">
						<text fg={TuiNamedColors.error} attributes={TextAttributes.BOLD}>
							Failed to execute macro plan:
						</text>
						<text fg={TuiNamedColors.primary} marginTop={1}>
							Extension 'retail.checkout' returned invalid status code 500.
						</text>
						<box marginTop={2} flexDirection="row">
							<TuiButton label="Retry" isFocused={true} />
							<text> </text>
							<TuiButton label="Dismiss" />
						</box>
					</box>
				</TuiModal>
			);
		}

		return (
			<TuiModal title="Confirm Action" dismissHint="esc" width={width}>
				<box flexDirection="column">
					<text fg={TuiNamedColors.primary}>
						Are you sure you want to discard unsaved scratchpad modifications?
					</text>
					<box marginTop={2} flexDirection="row">
						<TuiButton label="Cancel" />
						<text> </text>
						<TuiButton label="Discard" isFocused={true} />
					</box>
				</box>
			</TuiModal>
		);
	},
};
