import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { formatParsedItem } from "../formatter/format-parsed";
import { t } from "../lib/i18n";

interface WorkspaceScreenProps {
	snapshot: WorkspaceSnapshot | null;
	loading: boolean;
	error: string | null;
	focused: boolean;
	onClose: () => void;
	onProcessInput: (branchId: string, text: string) => Promise<void>;
	onComplete: (branchId: string) => Promise<void>;
	onAddBranch: (name: string, conceptText: string) => Promise<void>;
	onToggleFocus: () => void;
	workspaceCommandMappings: Record<string, string>;
}

function StatusBadge({ status }: { status: string }) {
	const color =
		status === "active"
			? "green"
			: status === "suspended"
				? "yellow"
				: status === "confirmed"
					? "blue"
					: status === "rule_out"
						? "red"
						: "gray";
	return (
		<Text color={color as any}>
			{status === "rule_out" ? t("workspace.ruledOut") : status}
		</Text>
	);
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
	onComplete,
	onAddBranch,
	onToggleFocus,
	workspaceCommandMappings,
}: WorkspaceScreenProps) {
	const [inputText, setInputText] = useState("");

	useInput((_input, key) => {
		if (key.escape) {
			onClose();
		}
		if (key.return && inputText.trim()) {
			handleSubmit(inputText.trim());
			setInputText("");
		}
		if (_input === "f") {
			onToggleFocus();
		}
		if (_input === "w") {
			const wid = snapshot?.activeBranchId;
			if (wid) {
				onComplete(wid);
			}
		}
	});

	const handleSubmit = async (text: string) => {
		if (!snapshot) return;
		const activeBranchId = snapshot.activeBranchId;
		if (!activeBranchId && snapshot.branches.length === 0) {
			await onAddBranch("Hypothesis", text);
			return;
		}
		const branchId = activeBranchId ?? snapshot.branches[0]!.branchId;
		const tokens = text.trim().split(/\s+/);
		const first = tokens[0]?.toLowerCase();
		if (!first) return;
		const command = workspaceCommandMappings[first] ?? first;
		if (workspaceCommandMappings[first] || command === first) {
			if (command === "branch" && tokens.length >= 3) {
				await onAddBranch(tokens[1]!, tokens.slice(2).join(" "));
				return;
			}
			if (command === "close") {
				await onComplete(branchId!);
				return;
			}
			await onProcessInput(branchId!, text);
			return;
		}
		await onProcessInput(branchId!, text);
	};

	const branches = snapshot?.branches ?? [];

	return (
		<Box flexDirection="column" width="100%" height="100%">
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
					{" · f: focus · w: complete · Esc: close"}
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
					{inputText ? `> ${inputText}` : `> ${t("workspace.inputHint")}`}
				</Text>
			</Box>
		</Box>
	);
}
