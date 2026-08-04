import type { WorkspaceSnapshot } from "@stateful-mcp/clinical/workspaces/workspace-snapshot";
import { Box, Text } from "ink";
import { t } from "../lib/shared/i18n";
import { StatusBadge } from "./StatusBadge";

interface WorkspaceViewProps {
	snapshot: WorkspaceSnapshot | null;
	loading: boolean;
	error: string | null;
	focused: boolean;
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
			{facts.map((fact) => {
				return (
					<Box key={fact.factId} paddingLeft={2}>
						<Text dimColor>
							◆ {fact.targetSchema}: {fact.concept?.display ?? fact.certainty}
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
					{branch.supportingConcepts.length}+ / {branch.refutingConcepts.length}
					-
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
			{showDetails &&
				(branch.supportingConcepts.length > 0 ||
					branch.refutingConcepts.length > 0) && (
					<Box paddingLeft={3} flexDirection="column">
						{branch.supportingConcepts.map((concept) => (
							<Box key={concept.conceptId ?? concept.display}>
								<Text color="green">
									+ {concept.display ?? concept.conceptId}
								</Text>
							</Box>
						))}
						{branch.refutingConcepts.map((concept) => (
							<Box key={concept.conceptId ?? concept.display}>
								<Text color="red">
									– {concept.display ?? concept.conceptId}
								</Text>
							</Box>
						))}
					</Box>
				)}
			{showDetails &&
				branch.supportingConcepts.length === 0 &&
				branch.refutingConcepts.length === 0 && (
					<Box paddingLeft={3}>
						<Text color="gray">{t("workspace.noFindings")}</Text>
					</Box>
				)}
		</Box>
	);
}

/**
 * Workspace primary view: the active workspace's branches, global facts, and a
 * header with command hints. This is what the workspace window's primary region
 * renders — intentionally distinct from the notebook's SOAP `CellList`.
 */
export function WorkspaceView({
	snapshot,
	loading,
	error,
	focused,
}: WorkspaceViewProps) {
	const branches = snapshot?.branches ?? [];
	return (
		<Box flexDirection="column" width="100%" height="100%" paddingLeft={1}>
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
				{snapshot?.closeRequested && (
					<Text color="yellow">{" · CLOSE REQUESTED"}</Text>
				)}
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

			<Box flexDirection="column" paddingTop={1}>
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
		</Box>
	);
}
