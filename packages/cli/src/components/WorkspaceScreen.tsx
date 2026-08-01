import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { formatParsedItem } from "../formatter/format-parsed";
import { t } from "../lib/i18n";
import { StatusBadge } from "./StatusBadge";

interface WorkspaceScreenProps {
	snapshot: WorkspaceSnapshot | null;
	loading: boolean;
	error: string | null;
	focused: boolean;
	onClose: () => void;
	onProcessInput: (branchId: string, text: string) => Promise<void>;
	getCommandSuggestions: (text: string) => string[];
	onFocusBranch: (branchRef: string) => Promise<void>;
}

function GlobalFactsStrip({
	facts,
}: {
	facts: WorkspaceSnapshot["globalFacts"];
}) {
	if (facts.length === 0) return null;
	return (
		<Box flexDirection="column" marginBottom={1}>
			<Text bold underline>
				{t("workspace.globalFacts")}
			</Text>
			{facts.map((f, i) => {
				const fmt = formatParsedItem({
					targetSchema: f.targetSchema,
					rawText: f.rawText ?? "",
					tag: "",
					extractedData: f.extractedData ?? {},
					concept: [],
					attributes: {},
				});
				return (
					<Box key={i} paddingLeft={2}>
						<Text dimColor>
							◆{" "}
							{fmt.fields
								.map((f) => `${f.field}=${String(f.value)}`)
								.join(" · ")}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}

function BranchCard({
	branch,
	isActive,
	isFocused,
}: {
	branch: WorkspaceSnapshot["branches"][number];
	isActive: boolean;
	isFocused: boolean;
}) {
	const showDetails = isActive || !isFocused;
	return (
		<Box
			flexDirection="column"
			borderStyle="single"
			borderColor={isActive ? "green" : "gray"}
			paddingLeft={1}
			paddingRight={1}
			marginBottom={1}
		>
			<Box>
				<Text bold={isActive} color={isActive ? "green" : undefined}>
					{isActive ? "► " : "  "}
				</Text>
				<Text bold>{branch.name}</Text>
				<Text color="gray">
					{" "}
					<StatusBadge status={branch.status} />
				</Text>
				<Text color="gray">
					{" "}
					{branch.supportingCount}+ / {branch.refutingCount}-
				</Text>
			</Box>
			{branch.hypothesisConcept && (
				<Box paddingLeft={3}>
					<Text color="cyan">
						{t("workspace.hypothesis", {
							value: branch.hypothesisConcept.display,
						})}
					</Text>
				</Box>
			)}
			{showDetails && branch.supporting.length > 0 && (
				<Box paddingLeft={3} flexDirection="column">
					{branch.supporting.map((s, i) => (
						<Box key={`s${i}`}>
							<Text color="green">+ {s}</Text>
						</Box>
					))}
					{branch.refuting.map((r, i) => (
						<Box key={`r${i}`}>
							<Text color="red">– {r}</Text>
						</Box>
					))}
				</Box>
			)}
			{showDetails &&
				branch.supporting.length === 0 &&
				branch.refuting.length === 0 && (
					<Box paddingLeft={3}>
						<Text color="gray">{t("workspace.noFindings")}</Text>
					</Box>
				)}
		</Box>
	);
}

export function WorkspaceScreen({
	snapshot,
	loading,
	error,
	focused,
	onClose,
	onProcessInput,
	getCommandSuggestions,
	onFocusBranch,
}: WorkspaceScreenProps) {
	const [inputText, setInputText] = useState("");
	const [editing, setEditing] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [suggestionIndex, setSuggestionIndex] = useState(0);
	const suggestions = inputText.trim().startsWith(":")
		? getCommandSuggestions(inputText)
		: [];

	useInput((_input, key) => {
		if (key.escape) {
			if (editing || inputText) {
				setInputText("");
				setEditing(false);
			} else {
				onClose();
			}
			return;
		}
		if (!editing) {
			if (_input === "i" || _input === "a") {
				setEditing(true);
				return;
			}
			if (_input === "?") {
				setShowHelp(true);
				return;
			}
			return;
		}
		if (key.return && (key.ctrl || key.meta)) {
			if (inputText.trim()) {
				handleSubmit(inputText.trim());
			}
			setInputText("");
			setEditing(false);
			return;
		}
		if (key.tab && suggestions.length > 0) {
			const suggestion = suggestions[suggestionIndex % suggestions.length];
			if (suggestion) {
				const parts = inputText.split(/\s+/);
				parts[parts.length - 1] = suggestion;
				setInputText(parts.join(" "));
				setSuggestionIndex((index) => (index + 1) % suggestions.length);
			}
			return;
		}
		if (key.return) {
			setInputText((prev) => `${prev}\n`);
			return;
		}
		if (key.backspace) {
			setInputText((prev) => prev.slice(0, -1));
			return;
		}
		if (_input.length === 1 && !key.ctrl && !key.meta) {
			setInputText((prev) => prev + _input);
			setSuggestionIndex(0);
		}
	});

	const handleSubmit = async (text: string) => {
		const tokens = text.trim().split(/\s+/);
		const first = tokens[0]?.toLowerCase();
		if (!first) return;
		if (first === ":help" || first === "help") {
			setShowHelp(true);
			return;
		}
		if (first === ":focus" || first === "focus") {
			if (tokens[1]) await onFocusBranch(tokens[1]);
			return;
		}
		if (
			first === ":back" ||
			first === ":exit" ||
			first === "back" ||
			first === "exit"
		) {
			onClose();
			return;
		}
		if (!snapshot) return;
		const activeBranchId = snapshot.activeBranchId;
		if (!activeBranchId && snapshot.branches.length === 0) return;
		const branchId = activeBranchId ?? snapshot.branches[0]!.branchId;
		await onProcessInput(branchId!, text);
	};

	const branches = snapshot?.branches ?? [];

	return (
		<Box flexDirection="column" width="100%" height="100%">
			{showHelp && (
				<Box
					borderStyle="single"
					paddingLeft={1}
					paddingRight={1}
					flexDirection="column"
				>
					<Text bold>Workspace commands</Text>
					<Text color="gray">
						i/a edit · Enter newline · Ctrl-Enter submit · Esc cancel/back
					</Text>
					<Text color="gray">
						:branch :confirm :rule_out :suspend :re_activate :elevate :complete
					</Text>
				</Box>
			)}
			<Box>
				<Text bold inverse>
					{" "}
					{t("workspace.title")}{" "}
				</Text>
				<Text>
					{" "}
					·{" "}
					{t("workspace.branches", {
						count: branches.length,
						plural: branches.length !== 1 ? "es" : "",
					})}
					{focused ? ` · ${t("workspace.focused")}` : ""}
					{" · i/a: edit · Esc: back"}
				</Text>
			</Box>

			{loading && (
				<Box paddingLeft={1}>
					<Text color="gray">{t("workspace.loading")}</Text>
				</Box>
			)}

			{error && (
				<Box paddingLeft={1}>
					<Text color="red">{error}</Text>
				</Box>
			)}

			{snapshot && branches.length === 0 && !loading && (
				<Box paddingLeft={1}>
					<Text color="gray">
						{t("workspace.noBranches", { cmd: t("workspace.branchCmd") })}
					</Text>
				</Box>
			)}

			<GlobalFactsStrip facts={snapshot?.globalFacts ?? []} />

			<Box flexDirection="column" paddingLeft={1} paddingTop={1}>
				{branches.map((b) => {
					const isActive = b.branchId === snapshot?.activeBranchId;
					return (
						<BranchCard
							key={b.branchId}
							branch={b}
							isActive={isActive}
							isFocused={focused}
						/>
					);
				})}
			</Box>

			<Box
				borderStyle="single"
				borderColor="cyan"
				paddingLeft={1}
				paddingRight={1}
				marginTop={1}
			>
				<Text>
					{inputText
						? `> ${inputText}`
						: `> ${editing ? t("workspace.inputHint") : "i/a to edit"}`}
				</Text>
			</Box>
			{editing && suggestions.length > 0 && (
				<Box paddingLeft={1}>
					<Text color="cyan">
						COMMAND | workspace · {suggestions.slice(0, 6).join("  ")}
					</Text>
				</Box>
			)}
		</Box>
	);
}
