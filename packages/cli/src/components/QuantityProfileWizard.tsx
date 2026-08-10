import type {
	DistributivePrefixConfig,
	MeasurementWordBoundaryMode,
	QuantityGrammarProfile,
	UnitOrderMode,
} from "@stateful-mcp/clinical";
import { parseQuantityWithProfile } from "@stateful-mcp/clinical";
import { Box, Text, useInput } from "ink";
import { useState } from "react";

const STEPS = [
	"label",
	"unit_order",
	"unit_aliases",
	"operator_aliases",
	"range_delimiters",
	"distributive_prefix",
	"word_boundary",
] as const;

type Step = (typeof STEPS)[number];

export function QuantityProfileWizard({
	profiles,
	onChange,
	onClose,
}: {
	profiles: QuantityGrammarProfile[];
	onChange(profiles: QuantityGrammarProfile[]): void;
	onClose(): void;
}) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [stepIndex, setStepIndex] = useState(0);
	const [draft, setDraft] = useState("");
	const [testInput, setTestInput] = useState("120-130 mmHg");
	const [editingTest, setEditingTest] = useState(false);

	const activeProfile: QuantityGrammarProfile = profiles[selectedIndex] ?? {
		profileId: `qty_profile_${Date.now()}`,
		label: "New Quantity Profile",
		version: 1,
		decimalSeparator: ".",
		thousandsSeparator: ",",
		unitAliases: { bpm: "beats/min", mmhg: "mmHg" },
		operatorAliases: { ">": "gt", "<=": "lte" },
		rangeDelimiters: ["to", "-"],
		ordering: {
			unitOrder: "suffix",
			rangePattern: "distributive_suffix",
		},
		measurementWordBoundary: "both",
	};

	const currentStep = STEPS[stepIndex]!;

	const updateActive = (changes: Partial<QuantityGrammarProfile>) => {
		const next = { ...activeProfile, ...changes };
		const nextProfiles = [...profiles];
		const index = nextProfiles.findIndex((p) => p.profileId === next.profileId);
		if (index >= 0) nextProfiles[index] = next;
		else nextProfiles.push(next);
		onChange(nextProfiles);
	};

	const parsePreview = () => {
		try {
			const res = parseQuantityWithProfile(testInput, activeProfile, {
				allowRange: true,
				allowOperator: true,
				statistics: "accept",
				allowDataPointCount: true,
			});
			return res.value
				? `Lower: ${res.value.lower}${res.value.upper !== undefined ? `, Upper: ${res.value.upper}` : ""}, Unit: ${res.value.unit}${res.value.operator ? `, Op: ${res.value.operator}` : ""}`
				: `No match: ${res.diagnostics.map((d) => d.message).join("; ")}`;
		} catch (err) {
			return `Error: ${err instanceof Error ? err.message : String(err)}`;
		}
	};

	useInput((input, key) => {
		if (key.escape) return onClose();

		if (editingTest) {
			if (key.return) {
				setEditingTest(false);
				return;
			}
			if (key.backspace || key.delete) {
				setTestInput((t) => t.slice(0, -1));
				return;
			}
			if (input) setTestInput((t) => t + input);
			return;
		}

		if (key.ctrl && input === "t") {
			setEditingTest(true);
			return;
		}

		if (key.tab) {
			setStepIndex((idx) => (idx + 1) % STEPS.length);
			setDraft("");
			return;
		}

		if (key.backspace || key.delete) {
			setDraft((d) => d.slice(0, -1));
			return;
		}

		if (key.return) {
			const value = draft.trim();
			if (!value) return;

			if (currentStep === "label") {
				updateActive({ label: value });
			} else if (currentStep === "unit_order") {
				if (value === "suffix" || value === "prefix" || value === "flexible") {
					updateActive({
						ordering: {
							...activeProfile.ordering,
							unitOrder: value as UnitOrderMode,
						},
					});
				}
			} else if (currentStep === "unit_aliases") {
				const map = Object.fromEntries(
					value
						.split(",")
						.map((item) => item.split("=").map((part) => part.trim()))
						.filter((item) => item.length === 2 && item[0] && item[1]),
				);
				updateActive({ unitAliases: { ...activeProfile.unitAliases, ...map } });
			} else if (currentStep === "operator_aliases") {
				const map = Object.fromEntries(
					value
						.split(",")
						.map((item) => item.split("=").map((part) => part.trim()))
						.filter((item) => item.length === 2 && item[0] && item[1]),
				) as Record<string, "gt" | "gte" | "lt" | "lte" | "eq">;
				updateActive({
					operatorAliases: { ...activeProfile.operatorAliases, ...map },
				});
			} else if (currentStep === "range_delimiters") {
				updateActive({
					rangeDelimiters: value
						.split(",")
						.map((s) => s.trim())
						.filter(Boolean),
				});
			} else if (currentStep === "distributive_prefix") {
				const prefixConfig: DistributivePrefixConfig = {
					symbol: value,
					upperBoundSymbolPolicy: "optional",
				};
				updateActive({
					ordering: {
						...activeProfile.ordering,
						distributivePrefix: prefixConfig,
						rangePattern: "distributive_prefix",
					},
				});
			} else if (currentStep === "word_boundary") {
				if (["none", "before", "after", "both"].includes(value)) {
					updateActive({
						measurementWordBoundary: value as MeasurementWordBoundaryMode,
					});
				}
			}

			setDraft("");
			return;
		}

		if (input) setDraft((d) => d + input);
	});

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor="magenta"
			paddingX={1}
			marginTop={1}
		>
			<Text bold color="magenta">
				Quantity Grammar Profile Wizard ({selectedIndex + 1}/
				{Math.max(1, profiles.length)})
			</Text>
			<Text dimColor>
				Step [{stepIndex + 1}/{STEPS.length}]: {currentStep.toUpperCase()}
			</Text>
			<Text color="yellow">
				Active profile: {activeProfile.label} ({activeProfile.profileId})
			</Text>

			<Box marginY={1} flexDirection="column">
				<Text>
					Unit Order: <Text bold>{activeProfile.ordering.unitOrder}</Text> |
					Boundary:{" "}
					<Text bold>{activeProfile.measurementWordBoundary ?? "both"}</Text>
				</Text>
				<Text>
					Delimiters: {activeProfile.rangeDelimiters.join(", ")} | Prefix
					Symbol: {activeProfile.ordering.distributivePrefix?.symbol ?? "none"}
				</Text>
			</Box>

			<Text color="cyan">
				Edit {currentStep}: {draft || "type a value..."}
			</Text>

			<Box
				borderStyle="round"
				borderColor="yellow"
				paddingX={1}
				marginTop={1}
				flexDirection="column"
			>
				<Text bold color="yellow">
					Live Preview [Ctrl+T to edit test input]:
				</Text>
				<Text>
					Input:{" "}
					<Text bold color={editingTest ? "green" : "white"}>
						{testInput}
					</Text>
				</Text>
				<Text color="green">{parsePreview()}</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>
					Tab: switch step | Enter: save field value | Esc: close wizard
				</Text>
			</Box>
		</Box>
	);
}
