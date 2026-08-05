import { Box, Text, useStdout } from "ink";
import type { MacroDefinition } from "@stateful-mcp/clinical";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";
import type { MacroSlotProjection } from "../lib/editor/macro-slots";
import { buildMacroRenderSegments } from "../lib/editor/macro-render";
import { t } from "../lib/shared/i18n";

interface MacroEditorProps {
	draftText: string;
	cursorOffset: number;
	suggestions: AutocompleteSuggestion[];
	suggestionIndex: number;
	macroSlots?: MacroSlotProjection[];
	activeMacroArgumentId?: string;
	activeDefinition?: MacroDefinition | null;
	showCursor?: boolean;
}

export function MacroEditor({
	draftText,
	cursorOffset,
	suggestions,
	suggestionIndex,
	macroSlots = [],
	activeMacroArgumentId,
	activeDefinition,
	showCursor = true,
}: MacroEditorProps) {
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;
	const isNarrow = columns < 80;

	const segments = buildMacroRenderSegments(
		draftText,
		macroSlots,
		cursorOffset,
		showCursor,
	);

	const activeSlot = macroSlots.find(
		(slot) => slot.argumentId === activeMacroArgumentId,
	);

	// Determine the Hint Bar text dynamically
	let hintText = "Choose or type an argument name";
	if (activeMacroArgumentId && activeDefinition) {
		const argSpec = activeDefinition.arguments.find(
			(a) => a.argumentId === activeMacroArgumentId,
		);
		if (argSpec) {
			const spec = argSpec.extraction;
			const label = argSpec.name;

			// Try to derive placeholder text directly from matched template part
			let templateDisplayText: string | undefined;
			if (activeSlot?.formId && argSpec.forms) {
				const form = argSpec.forms.find((f) => f.formId === activeSlot.formId);
				const slotPart = form?.template.parts.find(
					(p) => p.kind === "slot" && p.argumentId === activeMacroArgumentId,
				);
				if (slotPart && slotPart.kind === "slot") {
					templateDisplayText = slotPart.displayText;
				}
			}

			if (templateDisplayText) {
				hintText = `${label} [${templateDisplayText}]`;
			} else {
				const groups = activeSlot?.captureSpans
					?.map((s) => `<${s.name}>`)
					.join(" ");
				hintText = `${label} ${groups}`;
			}
		}
	}

	// Filter suggestions
	const filteredSuggestions = (() => {
		if (!activeDefinition) {
			return suggestions;
		}
		if (activeMacroArgumentId) {
			return suggestions;
		}
		return suggestions.filter((s) => s.kind === "arg");
	})();

	// Title for suggestions box
	const suggestionsTitle = activeMacroArgumentId
		? `${activeMacroArgumentId} suggestions`
		: !activeDefinition
			? "Macro suggestions"
			: `${activeDefinition.macroName} arguments`;

	const visibleSuggestions = filteredSuggestions.slice(0, 8); // Show top 8 suggestions

	// Helper to format suggestion text and inject details for arguments
	const getSuggestionLabelAndDetail = (suggestion: AutocompleteSuggestion) => {
		const label = suggestion.label;
		let detail = suggestion.detail || "";
		if (!activeMacroArgumentId && activeDefinition) {
			const argSpec = activeDefinition.arguments.find(
				(a) => a.name === suggestion.label || a.argumentId === suggestion.label,
			);
			if (argSpec) {
				const spec = argSpec.extraction;
				if (spec.numericBounds) {
					const { min, max, step } = spec.numericBounds;
					detail = `(Range: ${min ?? ""}-${max ?? ""}, Step: ${step ?? 1})`;
				} else if (spec.kind === "measurement") {
					const allowed = spec.measurement?.allowedUnits?.join(", ") ?? "";
					detail = `(Allowed: ${allowed})`;
				} else if (spec.kind === "temporal") {
					detail = `(Temporal/Date)`;
				}
			}
		}
		return { label, detail };
	};

	return (
		<Box flexDirection="column" width="100%">
			{/* Macro editor input surface */}
			<Box
				flexDirection="column"
				borderStyle="single"
				borderColor="green"
				paddingX={1}
				width="100%"
			>
				<Text bold color="green">
					┌─ Macro editor ───────────────────────────────────────────────────────────────┐
				</Text>
				<Box paddingLeft={1} flexDirection="column">
					<Text bold>
						{segments.map((segment, index) => {
							if (segment.kind === "cursor") {
								return (
									<Text key={index} color="green">
										{segment.text}
									</Text>
								);
							}
							if (segment.kind === "slot") {
								const slot = macroSlots.find(
									(candidate) =>
										candidate.start <= draftText.indexOf(segment.text) &&
										candidate.end >=
											draftText.indexOf(segment.text) + segment.text.length,
								);
								return (
									<Text
										key={index}
										inverse
										color={
											slot?.status === "locked"
												? "magenta"
												: slot?.argumentId === activeMacroArgumentId
													? "yellow"
													: "cyan"
										}
										bold
									>
										[{segment.text}]
										{slot?.status === "locked" ? "*" : ""}
									</Text>
								);
							}
							return <Text key={index}>{segment.text}</Text>;
						})}
					</Text>
					{/* Hint Bar */}
					<Box marginTop={1}>
						<Text color="yellow" bold>
							{hintText}
						</Text>
					</Box>
				</Box>
				<Text bold color="green">
					└──────────────────────────────────────────────────────────────────────────────┘
				</Text>
			</Box>

			{/* Suggestions Panel */}
			{visibleSuggestions.length > 0 && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="cyan"
					paddingX={1}
					width="100%"
				>
					<Text bold color="cyan">
						┌─ {suggestionsTitle} ──────────────────────────────────────────────────────────┐
					</Text>
					{visibleSuggestions.map((suggestion, index) => {
						const isActive = index === suggestionIndex;
						const { label, detail } = getSuggestionLabelAndDetail(suggestion);

						// Format evidence
						let evidenceStr = "";
						const evidence = suggestion.macroEvidence;
						if (evidence) {
							if (isNarrow) {
								evidenceStr = " [learned]";
							} else {
								const parts: string[] = [];
								if (evidence.score !== undefined)
									parts.push(`score ${evidence.score.toFixed(2)}`);
								if (evidence.observationCount !== undefined)
									parts.push(`n=${evidence.observationCount}`);
								if (evidence.scope) parts.push(evidence.scope);
								if (evidence.reason) parts.push(evidence.reason);
								if (parts.length) {
									evidenceStr = `  ${parts.join("  ")}`;
								}
							}
						}

						const description =
							!isNarrow && detail ? `  — ${detail}` : "";

						return (
							<Box key={index} paddingLeft={1}>
								<Text
									inverse={isActive}
									bold={isActive}
									color={isActive ? "yellow" : undefined}
								>
									{isActive ? "> " : "  "}
									{label}
									{description}
									{evidenceStr}
								</Text>
							</Box>
						);
					})}
					<Text bold color="cyan">
						└──────────────────────────────────────────────────────────────────────────────┘
					</Text>
				</Box>
			)}
		</Box>
	);
}
