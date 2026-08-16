import { TextAttributes } from "@opentui/core";
import { TuiNamedColors } from "../tokens";

export interface TuiCompletionCandidate {
	readonly id: string;
	readonly label: string;
	readonly kind?: string;
	readonly detail?: string;
	readonly documentation?: string;
}

export interface TuiCompletionPopupProps {
	readonly candidates: readonly TuiCompletionCandidate[];
	readonly selectedIndex?: number;
	readonly width?: number;
	readonly maxVisible?: number;
}

export function TuiCompletionPopup({
	candidates,
	selectedIndex = 0,
	width = 54,
	maxVisible = 8,
}: TuiCompletionPopupProps) {
	const visible = candidates.slice(0, maxVisible);
	const selectedCandidate = candidates[selectedIndex];

	return (
		<box flexDirection="row" borderStyle="single" borderColor="cyan">
			{/* Left Column: Candidates & Kind */}
			<box flexDirection="column" width={Math.floor(width * 0.55)} paddingLeft={1} paddingRight={1}>
				{visible.map((candidate, idx) => {
					const isSelected = idx === selectedIndex;
					return (
						<box key={candidate.id} height={1} flexDirection="row">
							<text
								fg={isSelected ? "cyan" : TuiNamedColors.primary}
								attributes={isSelected ? TextAttributes.INVERSE | TextAttributes.BOLD : 0}
							>
								{candidate.label}
							</text>
							<box flexGrow={1} />
							{candidate.kind && (
								<text
									fg={isSelected ? "yellow" : TuiNamedColors.purple}
									attributes={isSelected ? TextAttributes.INVERSE : TextAttributes.DIM}
								>
									{candidate.kind}
								</text>
							)}
						</box>
					);
				})}
			</box>

			{/* Divider */}
			<box width={1}>
				<text fg={TuiNamedColors.border}>│</text>
			</box>

			{/* Right Column: Documentation Sidecar */}
			<box flexDirection="column" flexGrow={1} paddingLeft={1} paddingRight={1}>
				{selectedCandidate ? (
					<>
						<text fg={TuiNamedColors.accent} attributes={TextAttributes.BOLD}>
							{selectedCandidate.detail ?? selectedCandidate.label}
						</text>
						{selectedCandidate.documentation && (
							<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
								{selectedCandidate.documentation}
							</text>
						)}
					</>
				) : (
					<text fg={TuiNamedColors.muted} attributes={TextAttributes.DIM}>
						No preview available
					</text>
				)}
			</box>
		</box>
	);
}
