import type {
	DateTimeFormatConfig,
	DateTimeToken,
} from "@stateful-mcp/clinical";
import {
	findAmbiguousDateExamples,
	previewDateTimeFormat,
} from "@stateful-mcp/clinical";
import { Box, Text, useInput } from "ink";
import { useMemo, useState } from "react";

type WizardStep =
	| "name"
	| "token"
	| "separator"
	| "options"
	| "months"
	| "periods"
	| "example"
	| "preview";
type OptionName =
	| "locale"
	| "timezone"
	| "precision"
	| "centuries"
	| "exact"
	| "24-hour"
	| "preferred";
const TOKENS: DateTimeToken[] = [
	"DD",
	"MM",
	"MM_name",
	"YY",
	"YYYY",
	"HH",
	"min",
	"SS",
	"ampm",
	"tz",
];
const OPTION_NAMES: OptionName[] = [
	"locale",
	"timezone",
	"precision",
	"centuries",
	"exact",
	"24-hour",
	"preferred",
];

export function DateTimeFormatWizard({
	existingFormats,
	onConfirm,
	onCancel,
	onOpenNumeric,
	onOpenMeasurement,
}: {
	existingFormats: readonly DateTimeFormatConfig[];
	onConfirm(
		format: DateTimeFormatConfig,
		examples: string[],
		preferred: boolean,
	): void;
	onCancel(): void;
	onOpenNumeric(): void;
	onOpenMeasurement(): void;
}) {
	const [step, setStep] = useState<WizardStep>("name");
	const [draft, setDraft] = useState("");
	const [formatId, setFormatId] = useState("");
	const [tokens, setTokens] = useState<DateTimeToken[]>([]);
	const [separators, setSeparators] = useState<string[]>([]);
	const [tokenIndex, setTokenIndex] = useState(0);
	const [optionIndex, setOptionIndex] = useState(0);
	const [options, setOptions] = useState<DateTimeFormatConfig["options"]>({});
	const [preferred, setPreferred] = useState(false);
	const [monthAliases, setMonthAliases] = useState<string[][]>(() =>
		Array.from({ length: 12 }, () => []),
	);
	const [monthIndex, setMonthIndex] = useState(0);
	const [period, setPeriod] = useState<"am" | "pm">("am");
	const [dayPeriods, setDayPeriods] = useState<{ am: string[]; pm: string[] }>({
		am: [],
		pm: [],
	});
	const [examples, setExamples] = useState<string[]>([]);
	const [message, setMessage] = useState<string | undefined>();

	const format = useMemo<DateTimeFormatConfig>(
		() => ({
			id: formatId,
			tokens,
			separators,
			options: {
				...options,
				...(tokens.includes("MM_name") ? { monthAliases } : {}),
				...(tokens.includes("ampm") ? { dayPeriods } : {}),
			},
		}),
		[dayPeriods, formatId, monthAliases, options, separators, tokens],
	);
	const preview = useMemo(
		() => previewDateTimeFormat(format, examples),
		[examples, format],
	);

	const nextAfterOptions = () => {
		if (tokens.includes("MM_name")) setStep("months");
		else if (tokens.includes("ampm")) setStep("periods");
		else setStep("example");
		setDraft("");
	};

	useInput((input, key) => {
		if (key.escape) return onCancel();
		if (key.ctrl && input === "n") return onOpenNumeric();
		if (key.ctrl && input === "m") return onOpenMeasurement();
		if (key.upArrow && step === "token")
			return setTokenIndex(
				(value) => (value + TOKENS.length - 1) % TOKENS.length,
			);
		if (key.downArrow && step === "token")
			return setTokenIndex((value) => (value + 1) % TOKENS.length);
		if (key.tab) {
			if (step === "options")
				setOptionIndex((value) => (value + 1) % OPTION_NAMES.length);
			if (step === "months") setMonthIndex((value) => (value + 1) % 12);
			return;
		}
		if (key.backspace || key.delete)
			return setDraft((value) => value.slice(0, -1));

		if (step === "token" && input === "s" && tokens.length > 0) {
			setStep("options");
			setDraft("");
			return;
		}
		if (
			step === "example" &&
			key.ctrl &&
			input === "p" &&
			examples.length > 0
		) {
			setStep("preview");
			setMessage(undefined);
			return;
		}

		if (key.return) {
			if (step === "name") {
				if (!draft.trim())
					return setMessage("Enter a format name before choosing components");
				setFormatId(draft.trim());
				setDraft("");
				setStep("token");
				return;
			}
			if (step === "token") {
				const token = TOKENS[tokenIndex]!;
				if (tokens.includes(token) && token !== "MM_name")
					return setMessage(`${token} is already in the sequence`);
				setTokens((value) => [...value, token]);
				setMessage(undefined);
				if (tokens.length > 0) setStep("separator");
				return;
			}
			if (step === "separator") {
				setSeparators((value) => [...value, draft]);
				setDraft("");
				setStep("token");
				return;
			}
			if (step === "options") {
				const option = OPTION_NAMES[optionIndex]!;
				const value = draft.trim();
				if (option === "exact" || option === "preferred") {
					if (value !== "yes" && value !== "no")
						return setMessage("Enter yes or no");
					if (option === "exact")
						setOptions((current) => ({ ...current, exact: value === "yes" }));
					if (option === "preferred") setPreferred(value === "yes");
				} else if (option === "24-hour") {
					if (value !== "yes" && value !== "no")
						return setMessage("Enter yes or no");
					setOptions((current) => ({ ...current, is24Hour: value === "yes" }));
				} else if (option === "precision") {
					if (value !== "day" && value !== "minute" && value !== "second")
						return setMessage("Enter day, minute, or second");
					setOptions((current) => ({ ...current, precision: value }));
				} else if (option === "centuries") {
					if (tokens.includes("YYYY")) {
						const centuries = value
							.split(",")
							.map((item) => item.trim())
							.filter((item) => /^\d{2}$/u.test(item));
						if (centuries.length === 0)
							return setMessage(
								"Enter comma-separated two-digit centuries, for example 19,20,21",
							);
						setOptions((current) => ({
							...current,
							centuryDecades: Object.fromEntries(
								centuries.map((century) => [century, "\\d"]),
							),
						}));
					}
				} else if (option === "locale") {
					setOptions((current) => ({
						...current,
						...(value ? { locale: value } : {}),
					}));
				} else if (option === "timezone") {
					setOptions((current) => ({
						...current,
						...(value ? { timeZone: value } : {}),
					}));
				}
				setDraft("");
				if (optionIndex === OPTION_NAMES.length - 1) nextAfterOptions();
				else setOptionIndex((value) => value + 1);
				return;
			}
			if (step === "months") {
				const aliases = draft
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean);
				if (aliases.length === 0)
					return setMessage(
						`Enter at least one alias for month ${monthIndex + 1}`,
					);
				setMonthAliases((current) =>
					current.map((value, index) =>
						index === monthIndex ? aliases : value,
					),
				);
				setDraft("");
				if (monthIndex === 11) {
					if (tokens.includes("ampm")) setStep("periods");
					else setStep("example");
				} else setMonthIndex((value) => value + 1);
				return;
			}
			if (step === "periods") {
				const aliases = draft
					.split(",")
					.map((value) => value.trim())
					.filter(Boolean);
				if (aliases.length === 0)
					return setMessage(`Enter at least one ${period.toUpperCase()} alias`);
				const next = { ...dayPeriods, [period]: aliases };
				setDayPeriods(next);
				setDraft("");
				if (period === "am") setPeriod("pm");
				else setStep("example");
				return;
			}
			if (step === "example") {
				const candidate = draft.trim();
				if (!candidate)
					return setMessage("Enter an example before confirming it");
				const candidatePreview = previewDateTimeFormat(format, [
					...examples,
					candidate,
				]);
				if (!candidatePreview.valid)
					return setMessage(
						candidatePreview.diagnostics.map((item) => item.message).join("; "),
					);
				setExamples((value) => [...value, candidate]);
				setDraft("");
				setMessage(
					"Example confirmed. Press P to preview and finish, or enter another example.",
				);
				return;
			}
			if (step === "preview") {
				if (!preview.valid)
					return setMessage(
						preview.diagnostics.map((item) => item.message).join("; "),
					);
				const ambiguous = examples.flatMap((example) =>
					findAmbiguousDateExamples(
						existingFormats.filter((item) => item.id !== format.id),
						example,
					),
				);
				if (ambiguous.length > 0)
					return setMessage(
						`Example matches another format: ${[...new Set(ambiguous)].join(", ")}. Rename or revise this format.`,
					);
				onConfirm(format, examples, preferred);
			}
			return;
		}
		if (input) setDraft((value) => value + input);
	});

	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor="cyan"
			paddingX={1}
			marginTop={1}
		>
			<Text bold color="cyan">
				Date/time format builder
			</Text>
			<Text dimColor>
				Build components explicitly. No date order, separator, locale, or alias
				is assumed. Ctrl+N numeric, Ctrl+M measurement.
			</Text>
			<Text>Step: {step}</Text>
			{step === "name" && (
				<Text color="yellow">Format name: {draft || "type a name"}</Text>
			)}
			{step === "token" && (
				<>
					<Text color="yellow">
						Token: {TOKENS[tokenIndex]} (↑/↓ choose, Enter add, S finish
						sequence)
					</Text>
					<Text>Sequence: {tokens.join(" ") || "empty"}</Text>
				</>
			)}
			{step === "separator" && (
				<>
					<Text color="yellow">
						Separator after {tokens[tokens.length - 1]}: [{draft}]
					</Text>
					<Text dimColor>
						Enter accepts empty, whitespace, punctuation, or words exactly as
						typed.
					</Text>
				</>
			)}
			{step === "options" && (
				<>
					<Text color="yellow">
						{OPTION_NAMES[optionIndex]}: {draft || "type a value"}
					</Text>
					<Text dimColor>
						locale/timezone: free text | precision: day, minute, second |
						centuries: 19,20,21 | exact/24-hour/preferred: yes or no
					</Text>
				</>
			)}
			{step === "months" && (
				<>
					<Text color="yellow">
						Month {monthIndex + 1} aliases:{" "}
						{draft || "type comma-separated aliases"}
					</Text>
					<Text dimColor>
						Each month is semantic and must be configured independently.
					</Text>
				</>
			)}
			{step === "periods" && (
				<Text color="yellow">
					{period.toUpperCase()} aliases:{" "}
					{draft || "type comma-separated aliases"}
				</Text>
			)}
			{step === "example" && (
				<>
					<Text color="yellow">
						Confirmed examples: {examples.join(" | ") || "none"}
					</Text>
					<Text color="yellow">
						New example:{" "}
						{draft || "type an example; Enter confirms; Ctrl+P previews"}
					</Text>
				</>
			)}
			{step === "preview" && (
				<>
					<Text bold>Generated matcher preview</Text>
					<Text>{preview.pattern || "not compiled"}</Text>
					<Text>Tokens: {tokens.join(" → ")}</Text>
					<Text>
						Examples:{" "}
						{preview.matches
							.map((item) => `${item.example} ${JSON.stringify(item.captures)}`)
							.join(" | ")}
					</Text>
					{preview.diagnostics.map((item) => (
						<Text key={item.code} color="red">
							✗ {item.message}
						</Text>
					))}
					<Text color={preview.valid ? "green" : "red"}>
						{preview.valid
							? "Enter confirms this format"
							: "Format cannot be confirmed"}
					</Text>
				</>
			)}
			{message && <Text color="yellow">! {message}</Text>}
		</Box>
	);
}
