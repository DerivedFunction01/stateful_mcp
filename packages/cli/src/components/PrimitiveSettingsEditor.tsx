import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { SetupPrimitiveProfile } from "@stateful-mcp/clinical";

type Mode = "numeric" | "measurement";
const NUMERIC_FIELDS = ["decimal separator", "thousands separator", "comparison operators"] as const;
const MEASUREMENT_FIELDS = ["unit order", "unit aliases", "range delimiters", "operator aliases"] as const;

export function PrimitiveSettingsEditor({
	mode,
	profile,
	onChange,
	onOpenDate,
	onCancel,
}: {
	mode: Mode;
	profile: SetupPrimitiveProfile;
	onChange(profile: SetupPrimitiveProfile): void;
	onOpenDate(): void;
	onCancel(): void;
}) {
	const fields = mode === "numeric" ? NUMERIC_FIELDS : MEASUREMENT_FIELDS;
	const [fieldIndex, setFieldIndex] = useState(0);
	const [draft, setDraft] = useState("");
	const field = fields[fieldIndex]!;
	const updateMap = (value: string) => Object.fromEntries(value.split(",").map((item) => item.split("=").map((part) => part.trim())).filter((item) => item.length === 2 && item[0] && item[1]));

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.ctrl && input === "d") return onOpenDate();
		if (key.tab) {
			setFieldIndex((value) => (value + 1) % fields.length);
			setDraft("");
			return;
		}
		if (key.backspace || key.delete) return setDraft((value) => value.slice(0, -1));
		if (key.return) {
			const value = draft.trim();
			if (mode === "numeric" && field === "decimal separator" && (value === "." || value === ",")) onChange({ ...profile, decimalSeparator: value });
			if (mode === "numeric" && field === "thousands separator" && [",", ".", " ", "none"].includes(value)) onChange({ ...profile, thousandsSeparator: value as "," | "." | " " | "none" });
			if (mode === "numeric" && field === "comparison operators" && value) onChange({ ...profile, comparisonOperators: value.split(",").map((item) => item.trim()).filter(Boolean) });
			if (mode === "measurement" && field === "unit order" && (value === "before" || value === "after")) onChange({ ...profile, measurementUnitOrder: value });
			if (mode === "measurement" && field === "unit aliases" && value) onChange({ ...profile, unitAliases: { ...(profile.unitAliases ?? {}), ...updateMap(value) } });
			if (mode === "measurement" && field === "range delimiters" && value) onChange({ ...profile, rangeDelimiters: value.split(",").map((item) => item.trim()) });
			if (mode === "measurement" && field === "operator aliases" && value) onChange({ ...profile, measurementOperatorAliases: { ...(profile.measurementOperatorAliases ?? {}), ...updateMap(value) } });
			setDraft("");
			return;
		}
		if (input) setDraft((value) => value + input);
	});

	return <Box flexDirection="column" borderStyle="single" borderColor="cyan" paddingX={1} marginTop={1}>
		<Text bold color="cyan">{mode === "numeric" ? "Numeric syntax" : "Measurement primitives"}</Text>
		<Text dimColor>Nothing is configured until a value is explicitly entered and confirmed.</Text>
		<Text color="yellow">{field}: {draft || "type a value"}</Text>
		<Text dimColor>{mode === "numeric" ? "decimal: . or , | thousands: , . space none | operators: comma-separated" : "unit order: before or after | aliases: alias=canonical | delimiters: comma-separated"}</Text>
		<Text>decimal: {profile.decimalSeparator ?? "unset"}  thousands: {profile.thousandsSeparator ?? "unset"}  unit order: {profile.measurementUnitOrder ?? "unset"}</Text>
		<Text dimColor>Tab changes field. Ctrl+D returns to date/time formats.</Text>
	</Box>;
}
