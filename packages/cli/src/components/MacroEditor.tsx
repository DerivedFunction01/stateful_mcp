import type {
	CommandMacroTemplatePart,
	MacroAuthoringRender,
	MacroDefinition,
	MacroDraftPreview,
} from "@stateful-mcp/clinical";
import { Box, Text, useStdout } from "ink";
import type { AutocompleteSuggestion } from "../lib/editor/autocomplete";
import { buildMacroRenderSegments } from "../lib/editor/macro-render";
import type { MacroSlotProjection } from "../lib/editor/macro-slots";
import { t } from "../lib/shared/i18n";

interface MacroEditorProps {
	draftText: string;
	cursorOffset: number;
	suggestions: AutocompleteSuggestion[];
	suggestionIndex: number;
	macroSlots?: MacroSlotProjection[];
	activeMacroArgumentId?: string;
	activeDefinition?: MacroDefinition | null;
	childDefinitions?: MacroDefinition[];
	authoringPreview?: MacroAuthoringRender;
	draftPreview?: MacroDraftPreview;
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
	childDefinitions = [],
	authoringPreview,
	draftPreview,
	showCursor = true,
}: MacroEditorProps) {
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;
	const isNarrow = columns < 80;

	const isConceptSlot = (slot: MacroSlotProjection): boolean => {
		const argument = activeDefinition?.arguments.find(
			(candidate) => candidate.argumentId === slot.argumentId,
		);
		return (
			argument?.extraction.kind === "concept" ||
			argument?.extraction.kind === "concept_array"
		);
	};
	const isResolvedSlot = (slot: MacroSlotProjection): boolean =>
		slot.status === "locked" ||
		Boolean(slot.binding) ||
		(!isConceptSlot(slot) && slot.status !== "invalid");
	const renderableMacroSlots = macroSlots.filter(isResolvedSlot);
	const activeSlot =
		macroSlots.find(
			(slot) =>
				slot.argumentId === activeMacroArgumentId && isResolvedSlot(slot),
		) ?? macroSlots.find((slot) => slot.argumentId === activeMacroArgumentId);
	const segments = buildMacroRenderSegments(
		draftText,
		renderableMacroSlots,
		cursorOffset,
		showCursor,
	);

	// Compute statuses for all arguments
	interface ArgStatus {
		name: string;
		status: "locked" | "broken" | "remaining";
		message?: string;
	}
	const statuses: ArgStatus[] = [];
	if (activeDefinition) {
		for (const arg of activeDefinition.arguments) {
			const slot =
				macroSlots.find(
					(s) => s.argumentId === arg.argumentId && isResolvedSlot(s),
				) ?? macroSlots.find((s) => s.argumentId === arg.argumentId);
			if (slot && isResolvedSlot(slot)) {
				if (slot.diagnostics?.length > 0) {
					statuses.push({
						name: arg.name,
						status: "broken",
						message: slot.diagnostics[0],
					});
				} else {
					statuses.push({
						name: arg.name,
						status: "locked",
					});
				}
			} else {
				statuses.push({
					name: arg.name,
					status: "remaining",
				});
			}
		}
	}

	// Determine the Hint Bar text dynamically
	let hintText = t("macro.chooseArg");
	if (activeDefinition) {
		// If the cursor is on a singular (non-plural) argument that is already
		// bound or locked, treat it as if no argument is active so the hint bar
		// falls through to the "remaining" discovery path instead of re-showing
		// the already-satisfied argument.
		const rawActiveArgSpec = activeMacroArgumentId
			? activeDefinition.arguments.find(
					(a) => a.argumentId === activeMacroArgumentId,
				)
			: undefined;
		const isActiveSingularSatisfied =
			rawActiveArgSpec !== undefined &&
			rawActiveArgSpec.extraction.kind !== "concept_array" &&
			rawActiveArgSpec.extraction.kind !== "array" &&
			activeSlot !== undefined &&
			(activeSlot.status === "locked" ||
				(activeSlot.status === "bound" &&
					rawActiveArgSpec.extraction.kind !== "concept") ||
				(activeSlot.status === "bound" && Boolean(activeSlot.binding)));
		const effectiveArgumentId = isActiveSingularSatisfied
			? undefined
			: activeMacroArgumentId;
		if (effectiveArgumentId) {
			const argSpec = activeDefinition.arguments.find(
				(a) => a.argumentId === effectiveArgumentId,
			);
			if (argSpec) {
				const label = argSpec.name;

				// Try to derive placeholder text directly from matched template part
				let templateDisplayText: string | undefined;
				if (activeSlot?.formId && argSpec.forms) {
					const form = argSpec.forms.find(
						(f) => f.formId === activeSlot.formId,
					);
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
					hintText = `${label} ${groups || "<value>"}`;
				}
			}
		} else {
			// Argument Discovery Mode: List remaining arguments and construct usage examples
			const remaining = statuses.filter((s) => s.status === "remaining");
			if (remaining.length > 0) {
				const remainingNames = remaining.map((r) => r.name).join(", ");
				// Generate dynamic usage recommendation for the first remaining argument
				const firstRemaining = remaining[0]?.name;
				const argSpec = activeDefinition.arguments.find(
					(a) => a.argumentId === firstRemaining || a.name === firstRemaining,
				);
				let example = "";
				if (argSpec) {
					const nameOrAlias = argSpec.aliases?.[0] || argSpec.name;
					let placeholder = "<value>";
					if (argSpec.forms?.[0]) {
						const slotPart = argSpec.forms[0].template.parts.find(
							(p) => p.kind === "slot",
						);
						if (slotPart && slotPart.kind === "slot" && slotPart.displayText) {
							placeholder = `[${slotPart.displayText}]`;
						}
					}
					example = t("macro.example", { name: nameOrAlias, placeholder });
				}
				hintText = t("macro.remaining", { names: remainingNames, example });
			} else {
				hintText = t("macro.allCaptured");
				// Check for chain continuation — find the first child definition
				// whose macroName is not already fully represented in macroSlots
				if (childDefinitions.length > 0) {
					// The parent's children[] defines the chain order.
					// Find the first child definition whose arguments are not all
					// yet present as locked slots in the current draft.
					const nextChild = childDefinitions.find((childDef) => {
						// Check if any slot for this child macro is still unbound
						const childSlots = macroSlots.filter(
							(s) => s.macroId === childDef.macroId,
						);
						const allLocked =
							childDef.arguments.length > 0 &&
							childDef.arguments.every((arg) =>
								childSlots.some(
									(s) =>
										s.argumentId === arg.argumentId && s.status === "locked",
								),
							);
						return !allLocked;
					});
					if (nextChild) {
						// Find its first authoring template or fall back to macroName
						const tmpl = nextChild.authoringTemplates?.[0];
						const nextLabel = tmpl
							? tmpl.parts
									.map((p: CommandMacroTemplatePart) =>
										p.kind === "literal"
											? p.text
											: `__${p.displayText ?? "SLOT"}__`,
									)
									.join("")
							: nextChild.macroName;
						hintText = t("macro.chainSuggestion", { next: nextLabel });
					}
				}
			}
		}
	}

	// Filter suggestions: suppress the panel for singular args that are already
	// bound/locked (effectiveArgumentId logic mirrors the hint bar above).
	const filteredSuggestions = (() => {
		if (!activeDefinition) {
			return suggestions;
		}
		if (activeMacroArgumentId) {
			const argSpec = activeDefinition.arguments.find(
				(a) => a.argumentId === activeMacroArgumentId,
			);
			if (argSpec) {
				const isPlural =
					argSpec.extraction.kind === "concept_array" ||
					argSpec.extraction.kind === "array";
				if (!isPlural) {
					// Suppress if already bound or locked (satisfied singular arg)
					if (
						activeSlot &&
						(activeSlot.status === "locked" ||
							(activeSlot.status === "bound" &&
								argSpec.extraction.kind !== "concept" &&
								argSpec.extraction.kind !== "concept_array") ||
							(activeSlot.status === "bound" && Boolean(activeSlot.binding)))
					) {
						return [];
					}
					const first = suggestions[0];
					if (
						suggestions.length === 1 &&
						activeSlot &&
						first &&
						(first.value === activeSlot.displayText ||
							first.label === activeSlot.displayText)
					) {
						return [];
					}
				}
			}
			return suggestions;
		}
		return suggestions;
	})();

	// Title for suggestions box — use effectiveArgumentId so a satisfied
	// singular arg doesn't keep its own title visible.
	const effectiveArgumentIdForTitle = (() => {
		if (!activeMacroArgumentId || !activeDefinition)
			return activeMacroArgumentId;
		const argSpec = activeDefinition.arguments.find(
			(a) => a.argumentId === activeMacroArgumentId,
		);
		if (!argSpec) return activeMacroArgumentId;
		const isPlural =
			argSpec.extraction.kind === "concept_array" ||
			argSpec.extraction.kind === "array";
		if (
			!isPlural &&
			activeSlot &&
			(activeSlot.status === "locked" ||
				(activeSlot.status === "bound" &&
					argSpec.extraction.kind !== "concept" &&
					argSpec.extraction.kind !== "concept_array") ||
				(activeSlot.status === "bound" && Boolean(activeSlot.binding)))
		) {
			return undefined;
		}
		return activeMacroArgumentId;
	})();
	const suggestionsTitle = effectiveArgumentIdForTitle
		? t("macro.suggestions", { arg: effectiveArgumentIdForTitle })
		: !activeDefinition
			? t("macro.suggestionsTitle")
			: "suggestions";

	const visibleSuggestions = filteredSuggestions.slice(0, 8); // Show top 8 suggestions

	// Helper to format suggestion text and inject details for arguments
	const getSuggestionLabelAndDetail = (suggestion: AutocompleteSuggestion) => {
		const label = suggestion.label;
		let detail = suggestion.detail || "";
		if (suggestion.provenance === "template") {
			detail = suggestion.targetArgument
				? `template → ${suggestion.targetArgument}`
				: "template";
		} else if (suggestion.provenance === "expression") {
			detail = suggestion.detail || "expression";
		} else if (suggestion.provenance === "numeric") {
			detail = "(within bounds)";
		} else if (suggestion.provenance === "argument-name") {
			detail = suggestion.detail || "argument";
		} else if (!activeMacroArgumentId && activeDefinition) {
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

	// Diagnostic status warnings
	const duplicateSlotsByArg = (() => {
		const grouped = new Map<string, typeof macroSlots>();
		for (const slot of macroSlots) {
			const list = grouped.get(slot.argumentId) ?? [];
			list.push(slot);
			grouped.set(slot.argumentId, list);
		}
		const duplicates: {
			argumentId: string;
			name: string;
			first: string;
			second: string;
		}[] = [];
		for (const [argId, list] of grouped.entries()) {
			if (list.length > 1) {
				const argName =
					activeDefinition?.arguments.find((a) => a.argumentId === argId)
						?.name ?? argId;
				duplicates.push({
					argumentId: argId,
					name: argName,
					first: list[0]?.rawText ?? "",
					second: list[1]?.rawText ?? "",
				});
			}
		}
		return duplicates;
	})();

	const activeSlotDiagnostics =
		activeSlot &&
		(activeSlot.status === "invalid" ||
			(activeSlot.diagnostics && activeSlot.diagnostics.length > 0))
			? (activeSlot.diagnostics || []).map((d) => ({
					rawText: activeSlot.rawText,
					message: d,
				}))
			: [];

	const activeArgSpec = activeDefinition?.arguments.find(
		(a) => a.argumentId === activeMacroArgumentId,
	);
	const isActiveSlotConcept =
		activeArgSpec &&
		(activeArgSpec.extraction.kind === "concept" ||
			activeArgSpec.extraction.kind === "concept_array");
	const isUnresolvedConcept =
		isActiveSlotConcept &&
		activeSlot &&
		activeSlot.status !== "locked" &&
		activeSlot.status !== "bound" &&
		activeSlot.rawText &&
		visibleSuggestions.length === 0;

	const showTypeHint =
		activeSlot &&
		visibleSuggestions.length === 0 &&
		!isUnresolvedConcept &&
		activeSlotDiagnostics.length === 0;
	const typeHintText = (() => {
		if (!showTypeHint || !activeArgSpec) return "";
		if (activeArgSpec.extraction.kind === "scalar") {
			return `Type an integer (Range: ${activeArgSpec.extraction.numericBounds?.min ?? ""}-${activeArgSpec.extraction.numericBounds?.max ?? ""})`;
		}
		return `Type a value for ${activeArgSpec.name}`;
	})();

	const shouldShowSuggestionsPanel =
		visibleSuggestions.length > 0 ||
		duplicateSlotsByArg.length > 0 ||
		activeSlotDiagnostics.length > 0 ||
		isUnresolvedConcept ||
		Boolean(typeHintText);

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
					┌─ Macro editor
					───────────────────────────────────────────────────────────────┐
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
										[{segment.text}]{slot?.status === "locked" ? "*" : ""}
									</Text>
								);
							}
							return <Text key={index}>{segment.text}</Text>;
						})}
					</Text>
					{/* Status Checklist */}
					{statuses.length > 0 && (
						<Box flexDirection="row" marginTop={1} gap={2}>
							<Text bold>{t("macro.status")}</Text>
							{statuses.map((item, index) => {
								let color = "gray";
								let prefix = "✗";
								if (item.status === "locked") {
									color = "green";
									prefix = "✓";
								} else if (item.status === "broken") {
									color = "yellow";
									prefix = "⚠";
								}
								return (
									<Text key={index} color={color} bold>
										{prefix} {item.name}
									</Text>
								);
							})}
						</Box>
					)}
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
			{shouldShowSuggestionsPanel && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="cyan"
					paddingX={1}
					width="100%"
				>
					<Text bold color="cyan">
						┌─ {suggestionsTitle}{" "}
						──────────────────────────────────────────────────────────┐
					</Text>

					{/* Duplicate Warnings */}
					{duplicateSlotsByArg.map((dup, idx) => (
						<Box
							key={`dup-${idx}`}
							flexDirection="column"
							paddingLeft={1}
							marginBottom={1}
						>
							<Text color="yellow" bold>
								⚠ Duplicate argument: {dup.name} assigned twice
							</Text>
							<Text color="gray">first: {dup.first}</Text>
							<Text color="gray">second: {dup.second}</Text>
							<Text color="yellow">Remove one to continue.</Text>
						</Box>
					))}

					{/* Active Slot Diagnostics */}
					{activeSlotDiagnostics.map((diag, idx) => (
						<Box key={`diag-${idx}`} paddingLeft={1} marginBottom={1}>
							<Text color="yellow" bold>
								⚠ "{diag.rawText}" — {diag.message}
							</Text>
						</Box>
					))}

					{/* Unresolved Concept Warning */}
					{isUnresolvedConcept && (
						<Box paddingLeft={1} flexDirection="column" marginBottom={1}>
							<Text color="gray" italic>
								(no matches)
							</Text>
							<Text color="yellow" bold>
								⚠ "{activeSlot.rawText}" — no expression or concept found
							</Text>
						</Box>
					)}

					{/* Type Hints */}
					{Boolean(typeHintText) && (
						<Box paddingLeft={1} marginBottom={1}>
							<Text color="gray" italic>
								{typeHintText}
							</Text>
						</Box>
					)}

					{/* Visible Suggestions */}
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

						const description = !isNarrow && detail ? `  — ${detail}` : "";
						const badge =
							!isNarrow && suggestion.provenance
								? `  [${suggestion.provenance}]`
								: "";

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
									{badge}
								</Text>
							</Box>
						);
					})}
					<Text bold color="cyan">
						└──────────────────────────────────────────────────────────────────────────────┘
					</Text>
				</Box>
			)}
			{authoringPreview && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor="gray"
					paddingX={1}
					width="100%"
				>
					<Text bold color="gray">
						Preview
					</Text>
					<Text>{authoringPreview.text}</Text>
					{(authoringPreview.missing.length > 0 ||
						authoringPreview.invalid.length > 0) && (
						<Text color="yellow">
							{authoringPreview.missing.length > 0
								? `Missing: ${authoringPreview.missing.join(", ")}`
								: `Invalid: ${authoringPreview.invalid.join(", ")}`}
						</Text>
					)}
				</Box>
			)}
			{draftPreview && (
				<Box
					flexDirection="column"
					borderStyle="single"
					borderColor={draftPreview.status === "valid" ? "green" : "yellow"}
					paddingX={1}
					width="100%"
				>
					<Text
						bold
						color={draftPreview.status === "valid" ? "green" : "yellow"}
					>
						Execution preview: {draftPreview.status}
					</Text>
					{draftPreview.rendered?.lines.map((line) => (
						<Text key={line}>{line}</Text>
					))}
					{draftPreview.diagnostics.map((diagnostic) => (
						<Text key={diagnostic} color="red">
							{diagnostic}
						</Text>
					))}
				</Box>
			)}
		</Box>
	);
}
