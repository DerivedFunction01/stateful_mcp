import type {
	CommandMacroTemplatePart,
	MacroAuthoringRender,
	MacroDefinition,
	MacroDraftPreview,
} from "@stateful-mcp/clinical";
import {
	findNextMacroChild,
	getMacroArgumentStatuses,
	isMacroSlotResolved,
} from "@stateful-mcp/clinical";
import { Box, Text } from "ink";
import { buildMacroRenderSegments } from "../lib/editor/macro-render";
import type { MacroSlotProjection } from "../lib/editor/macro-slots";
import { t } from "../lib/shared/i18n";

interface MacroEditorProps {
	draftText: string;
	cursorOffset: number;
	macroSlots?: MacroSlotProjection[];
	activeMacroArgumentId?: string;
	activeDefinition?: MacroDefinition | null;
	childDefinitions?: MacroDefinition[];
	authoringPreview?: MacroAuthoringRender;
	draftPreview?: MacroDraftPreview;
	executionMessage?: string | null;
	selectionStart?: number;
	selectionEnd?: number;
	showCursor?: boolean;
}

export function MacroEditor({
	draftText,
	cursorOffset,
	macroSlots = [],
	activeMacroArgumentId,
	activeDefinition,
	childDefinitions = [],
	authoringPreview,
	draftPreview,
	executionMessage,
	selectionStart,
	selectionEnd,
	showCursor = true,
}: MacroEditorProps) {
	const isResolvedSlot = (slot: MacroSlotProjection): boolean =>
		activeDefinition !== null &&
		activeDefinition !== undefined &&
		isMacroSlotResolved(slot, activeDefinition);
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

	const statuses = activeDefinition
		? getMacroArgumentStatuses(activeDefinition, macroSlots)
		: [];

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
					const nextChild = findNextMacroChild(childDefinitions, macroSlots);
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
		Boolean(activeSlot.rawText);

	const showTypeHint =
		activeSlot && !isUnresolvedConcept && activeSlotDiagnostics.length === 0;
	const typeHintText = (() => {
		if (!showTypeHint || !activeArgSpec) return "";
		if (activeArgSpec.extraction.kind === "scalar") {
			return `Type an integer (Range: ${activeArgSpec.extraction.numericBounds?.min ?? ""}-${activeArgSpec.extraction.numericBounds?.max ?? ""})`;
		}
		return `Type a value for ${activeArgSpec.name}`;
	})();

	const shouldShowDiagnosticsPanel =
		duplicateSlotsByArg.length > 0 ||
		activeSlotDiagnostics.length > 0 ||
		isUnresolvedConcept ||
		Boolean(typeHintText);

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor={draftPreview?.status === "invalid" ? "yellow" : "green"}
			paddingX={1}
			width="100%"
		>
			{/* Macro editor input surface */}
			<Box flexDirection="column" width="100%">
				<Text bold color="green">
					Macro editor
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
					{selectionStart !== undefined && selectionEnd !== undefined && (
						<Text color="cyan">
							Selection:{" "}
							{draftText.slice(
								Math.min(selectionStart, selectionEnd),
								Math.max(selectionStart, selectionEnd),
							)}
						</Text>
					)}
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
			</Box>

			{/* Suggestions Panel */}
			{shouldShowDiagnosticsPanel && (
				<Box flexDirection="column" width="100%">
					<Text bold color="cyan">
						Diagnostics
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
				</Box>
			)}
			{authoringPreview && (
				<Box flexDirection="column" width="100%">
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
				<Box flexDirection="column" width="100%">
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
			{executionMessage && (
				<Text color="cyan">Execution: {executionMessage}</Text>
			)}
		</Box>
	);
}
