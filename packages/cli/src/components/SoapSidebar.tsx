import type {
	ClinicalProseTemplate,
	PatientSearchResult,
	PatientStore,
} from "@stateful-mcp/clinical";
import type { QueryDefinition } from "@stateful-mcp/core/middleware/filter/types";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";

export function PatientSidebar({
	store,
	activePatient,
}: {
	store: PatientStore;
	activePatient: {
		name: { display?: string; primaryOrSurname: string };
		mrn: string;
	};
}) {
	const [open, setOpen] = useState(false);
	const [queryText, setQueryText] = useState("");
	const [results, setResults] = useState<PatientSearchResult[]>([]);
	const [index, setIndex] = useState(0);
	useInput((input, key) => {
		if (!open) {
			if (input === "/") {
				setOpen(true);
				setQueryText("");
			}
			return;
		}
		if (key.escape) {
			setOpen(false);
			return;
		}
		if (key.backspace || key.delete) {
			setQueryText((value) => value.slice(0, -1));
			return;
		}
		if (key.upArrow || input === "k") {
			setIndex((value) => Math.max(0, value - 1));
			return;
		}
		if (key.downArrow || input === "j") {
			setIndex((value) => Math.min(Math.max(0, results.length - 1), value + 1));
			return;
		}
		if (key.return) return;
		if (!key.ctrl && !key.meta && input.length === 1)
			setQueryText((value) => value + input);
	});
	useEffect(() => {
		const query: QueryDefinition = {
			projections: [
				"patientId",
				"mrn",
				"displayName",
				"administrativeGender",
				"lifecycle",
				"organismType",
			],
			filters: queryText
				? [
						{
							property: "displayName",
							operator: "str_contains",
							value: queryText,
						},
					]
				: [{ property: "lifecycle", operator: "eq", value: "active" }],
			sort: [{ property: "displayName", direction: "asc" }],
			limit: 25,
		};
		void store.search(query).then((next) => {
			setResults(next);
			setIndex(0);
		});
	}, [queryText, store]);
	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="green">
				PATIENT
			</Text>
			<Text>
				Active:{" "}
				{activePatient.name.display ?? activePatient.name.primaryOrSurname}
			</Text>
			<Text dimColor>{activePatient.mrn}</Text>
			<Text>{open ? `Search: ${queryText}_` : "/ search patients"}</Text>
			{open &&
				results.map((result, resultIndex) => (
					<Text
						key={result.patientId}
						inverse={resultIndex === index}
						wrap="truncate"
					>
						{resultIndex === index ? "> " : "  "}
						{result.displayName} ({result.mrn})
					</Text>
				))}
			<Text dimColor>Enter keeps subject read-only</Text>
		</Box>
	);
}

export function SoapTemplateSidebar({
	templates,
}: {
	templates: readonly ClinicalProseTemplate[];
}) {
	const roots = templates.filter(
		(template) => template.kind === "root" && template.active !== false,
	);
	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="yellow">
				SOAP TEMPLATES
			</Text>
			<Text dimColor>j/k preview Enter confirm</Text>
			{roots.map((root, index) => (
				<Text key={root.templateId} wrap="truncate">
					{index === 0 ? "> " : "  "}
					{root.templateName}
				</Text>
			))}
			<Text dimColor>Root swaps clear slot overrides.</Text>
		</Box>
	);
}
