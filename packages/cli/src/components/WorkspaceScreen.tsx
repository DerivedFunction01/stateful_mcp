import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/session/workspace-read-model";
import { Box, Text } from "ink";
import { useReducer as useReactReducer } from "react";
import { formatParsedItem } from "../formatter/format-parsed";
import {
	type CellSubmissionPlan,
	type CommandCatalog,
	createEditorKernelState,
	type EditorContext,
	reduceEditorKernel,
	type SubmissionPort,
} from "../lib/cell-editor";
import { t } from "../lib/i18n";
import { CellEditor } from "./CellEditor";
import { StatusBadge } from "./StatusBadge";
import { WorkspaceHelpScreen } from "./WorkspaceHelpScreen";

interface WorkspaceScreenProps {
	snapshot: WorkspaceSnapshot | null;
	sessionId: string;
	loading: boolean;
	error: string | null;
	focused: boolean;
	onClose: () => void;
	planSubmission: (text: string) => CellSubmissionPlan;
	onSubmitPlan: (plan: CellSubmissionPlan) => Promise<void>;
	commandCatalog: CommandCatalog;
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
	sessionId,
	loading,
	error,
	focused,
	onClose,
	planSubmission,
	onSubmitPlan,
	commandCatalog,
	onFocusBranch,
}: WorkspaceScreenProps) {
	const [editor, dispatch] = useReactReducer(
		reduceEditorKernel,
		undefined,
		createEditorKernelState,
	);
	const context: EditorContext = {
		hostKind: "workspace",
		collection: {
			kind: "workspace",
			collectionId: snapshot?.workspaceId ?? "",
		},
		sessionId,
		activeBranchId: snapshot?.activeBranchId ?? undefined,
	};
	const submission: SubmissionPort = {
		plan: (text) => planSubmission(text),
		submit: (plan) => onSubmitPlan(plan),
	};

	const branches = snapshot?.branches ?? [];
	if (editor.showHelp) {
		return (
			<WorkspaceHelpScreen
				descriptors={commandCatalog.getDescriptors(context)}
				onClose={() => dispatch({ type: "SHOW_HELP", show: false })}
			/>
		);
	}

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

			<CellEditor
				state={editor}
				dispatch={dispatch}
				context={context}
				catalog={commandCatalog}
				submission={submission}
				onClose={onClose}
				onShowHelp={() => dispatch({ type: "SHOW_HELP", show: true })}
				onUiCommand={async (line) => {
					const [command, branch] = line.split(/\s+/);
					switch (command) {
						case ":help":
						case "help":
							dispatch({ type: "SHOW_HELP", show: true });
							return true;
						case ":back":
						case ":exit":
						case "back":
						case "exit":
							onClose();
							return true;
						case ":focus":
						case "focus":
							if (branch) await onFocusBranch(branch);
							return true;
						default:
							return false;
					}
				}}
			/>
		</Box>
	);
}
