import { sanitizeProjectExtensionGroupId } from "@stateful-mcp/macro/project/extension-groups";
import type {
	ProjectConfigurationDto,
	ProjectExtensionActivationGroupDto,
	ProjectExtensionGroupOperationResult,
	ProjectExtensionGroupSourceDto,
	ProjectOperationResult,
} from "@stateful-mcp/macro-protocol";
import {
	AlertTriangle,
	Copy,
	Eye,
	Layers,
	Pencil,
	Plus,
	Trash2,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HostClient } from "../lib/host-client";
import { useI18n } from "../lib/macro-i18n-provider";
import {
	Badge,
	Button,
	Diagnostic,
	IconButton,
	TextInput,
} from "./ui/primitives";

interface GroupPreview {
	readonly added: readonly string[];
	readonly removed: readonly string[];
	readonly renamed: readonly { readonly from: string; readonly to: string }[];
	readonly membershipChanged: readonly string[];
	readonly activeFrom?: string;
	readonly activeTo?: string;
	readonly hasChanges: boolean;
}

type DiagnosticSeverity = "info" | "warning" | "error";

interface GroupDiagnostic {
	readonly severity: DiagnosticSeverity;
	readonly message: string;
}

function membersEqual(a: readonly string[], b: readonly string[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	return b.every((value) => set.has(value));
}

function makeGroup(
	id: string,
	extensionIds: readonly string[],
	source: ProjectExtensionGroupSourceDto = "project",
): ProjectExtensionActivationGroupDto {
	return { id, displayName: id, extensionIds, source };
}

export function ExtensionActivationGroupsModal({
	isOpen,
	client,
	onClose,
	onUpdated,
}: {
	readonly isOpen: boolean;
	readonly client: HostClient;
	readonly onClose: () => void;
	readonly onUpdated?: (
		result: ProjectOperationResult | ProjectExtensionGroupOperationResult,
	) => void;
}) {
	const { t } = useI18n();
	const [configuration, setConfiguration] = useState<ProjectConfigurationDto>();
	const [draft, setDraft] = useState<ProjectConfigurationDto>();
	const [activeExtensionGroupId, setActiveExtensionGroupId] = useState("");
	const [selectedGroupId, setSelectedGroupId] = useState<string>("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();
	const [creatingGroup, setCreatingGroup] = useState(false);
	const [newGroupName, setNewGroupName] = useState("");
	const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [showPreview, setShowPreview] = useState(false);
	const [showDiagnostics, setShowDiagnostics] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		if (!client.getProjectConfiguration) {
			setError(t("project.activationGroups.unavailable"));
			return;
		}
		setConfiguration(undefined);
		setDraft(undefined);
		setError(undefined);
		setCreatingGroup(false);
		setNewGroupName("");
		setRenamingGroupId(null);
		setSelectedGroupId("");
		setShowPreview(false);
		setShowDiagnostics(false);
		void client
			.getProjectConfiguration()
			.then((value) => {
				setConfiguration(value);
				setDraft(value);
				const active = value.activeExtensionGroupId ?? "";
				setActiveExtensionGroupId(active);
				const first = Object.keys(value.extensionGroups ?? {})[0] ?? "";
				setSelectedGroupId(active || first);
			})
			.catch((reason: unknown) =>
				setError(reason instanceof Error ? reason.message : String(reason)),
			);
	}, [client, isOpen, t]);

	const extensionsById = useMemo(
		() =>
			new Map(
				(draft?.extensions ?? []).map((extension) => [extension.id, extension]),
			),
		[draft?.extensions],
	);

	if (!isOpen) return null;

	const groups = draft?.extensionGroups ?? {};
	const groupIds = Object.keys(groups);
	const selectedGroup = selectedGroupId ? groups[selectedGroupId] : undefined;
	const selectedReadOnly = selectedGroup?.readOnly === true;

	const update = (change: Partial<ProjectConfigurationDto>) =>
		setDraft((value) => (value ? { ...value, ...change } : value));

	const setMembers = (groupId: string, ids: readonly string[]) => {
		if (!draft) return;
		const current = draft.extensionGroups ?? {};
		const base = current[groupId];
		if (!base) return;
		update({
			extensionGroups: {
				...current,
				[groupId]: { ...base, extensionIds: ids },
			},
		});
	};

	const toggleExtension = (extensionId: string, checked: boolean) => {
		if (!selectedGroupId || selectedReadOnly) return;
		const current = new Set(selectedGroup?.extensionIds ?? []);
		if (checked) current.add(extensionId);
		else current.delete(extensionId);
		setMembers(selectedGroupId, [...current]);
	};

	const commitCreateGroup = () => {
		if (!draft) return;
		const existing = draft.extensionGroups ?? {};
		const id =
			sanitizeProjectExtensionGroupId(newGroupName) ||
			`group-${groupIds.length + 1}`;
		if (id in existing) {
			setError(t("project.activationGroups.duplicateName", { name: id }));
			return;
		}
		update({ extensionGroups: { ...existing, [id]: makeGroup(id, []) } });
		setSelectedGroupId(id);
		setActiveExtensionGroupId(id);
		setCreatingGroup(false);
		setNewGroupName("");
		setError(undefined);
	};

	const commitRenameGroup = (oldId: string) => {
		if (!draft) return;
		const existing = draft.extensionGroups ?? {};
		const base = existing[oldId];
		if (!base || base.readOnly) return;
		update({
			extensionGroups: {
				...existing,
				[oldId]: {
					...base,
					displayName: renameValue.trim() || base.displayName,
				},
			},
		});
		setRenamingGroupId(null);
		setError(undefined);
	};

	const duplicateGroup = (sourceId: string) => {
		if (!draft) return;
		const existing = draft.extensionGroups ?? {};
		const base = existing[sourceId];
		if (!base) return;
		let id = `${sourceId}-copy`;
		let n = 1;
		while (id in existing) id = `${sourceId}-copy-${++n}`;
		update({
			extensionGroups: {
				...existing,
				[id]: makeGroup(id, base.extensionIds, "project"),
			},
		});
		setSelectedGroupId(id);
		setActiveExtensionGroupId(id);
	};

	const deleteGroup = (id: string) => {
		if (!draft) return;
		const base = (draft.extensionGroups ?? {})[id];
		if (!base || base.readOnly) return;
		if (
			!window.confirm(t("project.activationGroups.confirmDelete", { name: id }))
		)
			return;
		const existing = draft.extensionGroups ?? {};
		const next = { ...existing };
		delete next[id];
		update({ extensionGroups: next });
		if (selectedGroupId === id) setSelectedGroupId(Object.keys(next)[0] ?? "");
		if (activeExtensionGroupId === id) setActiveExtensionGroupId("");
	};

	const preview = useMemo<GroupPreview>(() => {
		const saved = configuration?.extensionGroups ?? {};
		const current = draft?.extensionGroups ?? {};
		const savedIds = new Set(Object.keys(saved));
		const currentIds = new Set(Object.keys(current));
		const removed = [...savedIds].filter((id) => !currentIds.has(id));
		const added = [...currentIds].filter((id) => !savedIds.has(id));
		const membershipChanged = [...savedIds]
			.filter((id) => currentIds.has(id))
			.filter(
				(id) =>
					!membersEqual(
						saved[id]?.extensionIds ?? [],
						current[id]?.extensionIds ?? [],
					),
			);
		const renamed: { from: string; to: string }[] = [];
		const remainingAdded = [...added];
		for (const from of removed) {
			const idx = remainingAdded.findIndex(
				(to) =>
					membersEqual(
						saved[from]?.extensionIds ?? [],
						current[to]?.extensionIds ?? [],
					) &&
					(saved[from]?.displayName ?? "") === (current[to]?.displayName ?? ""),
			);
			if (idx >= 0) {
				renamed.push({ from, to: remainingAdded[idx] ?? from });
				remainingAdded.splice(idx, 1);
			}
		}
		const activeFrom = configuration?.activeExtensionGroupId;
		const activeTo = activeExtensionGroupId || undefined;
		const hasChanges =
			removed.length > 0 ||
			remainingAdded.length > 0 ||
			membershipChanged.length > 0 ||
			renamed.length > 0 ||
			activeFrom !== activeTo;
		return {
			added: remainingAdded,
			removed,
			renamed,
			membershipChanged,
			activeFrom,
			activeTo,
			hasChanges,
		};
	}, [configuration, draft, activeExtensionGroupId]);

	const diagnostics = useMemo<readonly GroupDiagnostic[]>(() => {
		const results: GroupDiagnostic[] = [];
		const known = new Set(
			(draft?.extensions ?? []).map((extension) => extension.id),
		);
		for (const [groupId, group] of Object.entries(groups)) {
			const members = new Set(group.extensionIds);
			for (const id of group.extensionIds) {
				if (!known.has(id)) {
					results.push({
						severity: "error",
						message: t("project.activationGroups.diagUnknownExtension", {
							group: groupId,
							id,
						}),
					});
				}
			}
			for (const id of group.extensionIds) {
				for (const dependency of extensionsById.get(id)?.requires ?? []) {
					if (!members.has(dependency)) {
						results.push({
							severity: "warning",
							message: t("project.activationGroups.diagMissingDependency", {
								group: groupId,
								id,
								dep: dependency,
							}),
						});
					}
				}
			}
			const cycle = findCycle(group.extensionIds, (id) =>
				(extensionsById.get(id)?.requires ?? []).filter((dependency) =>
					members.has(dependency),
				),
			);
			if (cycle) {
				results.push({
					severity: "error",
					message: t("project.activationGroups.diagCycle", {
						group: groupId,
						path: cycle.join(" → "),
					}),
				});
			}
			if (
				groupId === activeExtensionGroupId &&
				group.extensionIds.length === 0
			) {
				results.push({
					severity: "info",
					message: t("project.activationGroups.diagEmptyActive", {
						group: groupId,
					}),
				});
			}
		}
		return results;
	}, [groups, draft, extensionsById, activeExtensionGroupId, t]);

	const apply = async () => {
		if (!draft || !configuration) return;
		if (
			!client.createExtensionGroup ||
			!client.updateExtensionGroup ||
			!client.deleteExtensionGroup ||
			!client.setActiveExtensionGroup
		)
			return;
		setBusy(true);
		setError(undefined);
		try {
			let revision = configuration.revision;
			let latest = configuration;
			let lastResult: ProjectExtensionGroupOperationResult | undefined;
			const saved = configuration.extensionGroups ?? {};
			const current = draft.extensionGroups ?? {};
			const pending: Array<
				(apply: boolean) => Promise<ProjectExtensionGroupOperationResult>
			> = [];
			const enqueue = (
				operation: (
					apply: boolean,
				) => Promise<ProjectExtensionGroupOperationResult>,
			) => pending.push(operation);
			const run = async (result: ProjectExtensionGroupOperationResult) => {
				if (result.status !== "accepted")
					throw new Error(
						"message" in result
							? result.message
							: "Extension group operation failed",
					);
				latest = result.configuration;
				revision = result.configuration.revision;
				lastResult = result;
			};
			for (const [id, group] of Object.entries(current)) {
				if (!saved[id])
					enqueue((apply) =>
						client.createExtensionGroup!(
							{
								groupId: group.id,
								displayName: group.displayName,
								description: group.description,
								extensionIds: group.extensionIds,
							},
							revision,
							apply,
						),
					);
				else if (
					group.displayName !== saved[id].displayName ||
					group.description !== saved[id].description ||
					!membersEqual(group.extensionIds, saved[id].extensionIds)
				)
					enqueue((apply) =>
						client.updateExtensionGroup!(
							{
								groupId: id,
								displayName: group.displayName,
								description: group.description,
								extensionIds: group.extensionIds,
							},
							revision,
							apply,
						),
					);
			}
			for (const id of Object.keys(saved))
				if (!current[id])
					enqueue((apply) =>
						client.deleteExtensionGroup!(id, revision, undefined, true, apply),
					);
			if (
				latest.activeExtensionGroupId !== (activeExtensionGroupId || undefined)
			)
				enqueue((apply) =>
					client.setActiveExtensionGroup!(
						activeExtensionGroupId || null,
						revision,
						apply,
					),
				);
			for (const [index, operation] of pending.entries())
				await run(await operation(index === pending.length - 1));
			setConfiguration(latest);
			setDraft(latest);
			if (lastResult) onUpdated?.(lastResult);
			onClose();
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : String(reason));
		} finally {
			setBusy(false);
		}
	};

	const errorCount = diagnostics.filter((d) => d.severity === "error").length;
	const warningCount = diagnostics.filter(
		(d) => d.severity === "warning",
	).length;

	return (
		<div className="modal-backdrop" onClick={onClose} role="presentation">
			<div
				className="modal-dialog activation-groups-dialog"
				onClick={(event) => event.stopPropagation()}
				role="dialog"
				aria-modal="true"
				aria-labelledby="activation-groups-title"
			>
				<header className="modal-header">
					<div className="modal-title-row">
						<Layers size={18} className="modal-icon" />
						<h2 id="activation-groups-title" className="modal-title">
							{t("project.activationGroups.title")}
						</h2>
					</div>
					<button
						type="button"
						className="modal-close-btn"
						onClick={onClose}
						aria-label={t("workbench.close")}
					>
						<X size={16} />
					</button>
				</header>
				{draft ? (
					<div className="activation-groups-body">
						<aside
							className="activation-groups-list"
							aria-label={t("project.activationGroups.groups")}
						>
							<div className="activation-groups-list-heading">
								<h3>{t("project.activationGroups.groups")}</h3>
								<Button
									variant="ghost"
									icon={<Plus size={14} />}
									onClick={() => {
										setCreatingGroup(true);
										setNewGroupName("");
									}}
								>
									{t("project.activationGroups.create")}
								</Button>
							</div>
							{creatingGroup && (
								<div className="activation-groups-create">
									<TextInput
										label={t("project.activationGroups.groupName")}
										value={newGroupName}
										placeholder={t(
											"project.activationGroups.groupNamePlaceholder",
										)}
										onChange={(event) => setNewGroupName(event.target.value)}
										autoFocus
									/>
									<div className="activation-groups-profile-actions">
										<Button
											variant="primary"
											onClick={() => commitCreateGroup()}
										>
											{t("project.activationGroups.add")}
										</Button>
										<Button
											variant="ghost"
											onClick={() => setCreatingGroup(false)}
										>
											{t("project.activationGroups.cancel")}
										</Button>
									</div>
								</div>
							)}
							{groupIds.length === 0 && !creatingGroup && (
								<span className="activation-groups-hint">
									{t("project.activationGroups.noGroups")}
								</span>
							)}
							<ul className="activation-groups-list-items">
								{groupIds.map((groupId) => {
									const group = groups[groupId];
									const isActive = groupId === activeExtensionGroupId;
									const isSelected = groupId === selectedGroupId;
									const memberCount = group?.extensionIds?.length ?? 0;
									return (
										<li
											key={groupId}
											className={
												isSelected
													? "activation-groups-list-row selected"
													: "activation-groups-list-row"
											}
										>
											<button
												type="button"
												className="activation-groups-list-select"
												onClick={() => setSelectedGroupId(groupId)}
												aria-pressed={isSelected}
											>
												{renamingGroupId === groupId ? (
													<TextInput
														label=""
														value={renameValue}
														onChange={(event) =>
															setRenameValue(event.target.value)
														}
														autoFocus
														onKeyDown={(event) => {
															if (event.key === "Enter")
																commitRenameGroup(groupId);
															if (event.key === "Escape")
																setRenamingGroupId(null);
														}}
													/>
												) : (
													<>
														<strong>{group?.displayName || groupId}</strong>
														<small>
															{t("project.activationGroups.memberCount", {
																count: memberCount,
															})}
														</small>
														{isActive && (
															<Badge tone="accent">
																{t("project.activationGroups.activeBadge")}
															</Badge>
														)}
														{group?.readOnly && (
															<Badge tone="neutral">
																{t("project.activationGroups.readOnly")}
															</Badge>
														)}
													</>
												)}
											</button>
											<div className="activation-groups-profile-actions">
												{renamingGroupId === groupId ? (
													<Button
														variant="primary"
														onClick={() => commitRenameGroup(groupId)}
													>
														{t("project.activationGroups.rename")}
													</Button>
												) : (
													<IconButton
														label={t("project.activationGroups.rename")}
														disabled={group?.readOnly}
														onClick={() => {
															setRenamingGroupId(groupId);
															setRenameValue(group?.displayName || groupId);
														}}
													>
														<Pencil size={14} />
													</IconButton>
												)}
												<IconButton
													label={t("project.activationGroups.duplicate")}
													onClick={() => duplicateGroup(groupId)}
												>
													<Copy size={14} />
												</IconButton>
												<IconButton
													label={t("project.activationGroups.delete")}
													disabled={group?.readOnly}
													onClick={() => deleteGroup(groupId)}
												>
													<Trash2 size={14} />
												</IconButton>
											</div>
										</li>
									);
								})}
							</ul>
						</aside>
						<section
							className="activation-groups-detail"
							aria-label={t("project.activationGroups.details")}
						>
							{!selectedGroup ? (
								<div className="activation-groups-empty">
									{t("project.activationGroups.noSelection")}
								</div>
							) : (
								<>
									<div className="activation-groups-detail-heading">
										<div>
											<h3>{selectedGroup.displayName || selectedGroupId}</h3>
											<small>
												{t("project.activationGroups.memberCount", {
													count: selectedGroup.extensionIds.length,
												})}
												{selectedGroup.readOnly && (
													<> · {t("project.activationGroups.readOnly")}</>
												)}
											</small>
										</div>
										{selectedGroupId !== activeExtensionGroupId ? (
											<Button
												variant="secondary"
												disabled={selectedReadOnly}
												onClick={() =>
													setActiveExtensionGroupId(selectedGroupId)
												}
											>
												{t("project.activationGroups.setActive")}
											</Button>
										) : (
											<Badge tone="accent">
												{t("project.activationGroups.activeBadge")}
											</Badge>
										)}
									</div>
									<div className="activation-groups-members">
										<h4>{t("project.activationGroups.extensions")}</h4>
										{(draft.extensions ?? []).map((extension) => {
											const enabled = selectedGroup.extensionIds.includes(
												extension.id,
											);
											const locked = false;
											return (
												<label
													className={
														locked
															? "activation-groups-member-row locked"
															: "activation-groups-member-row"
													}
													key={extension.id}
												>
													<input
														type="checkbox"
														checked={enabled}
														disabled={selectedReadOnly || locked}
														onChange={(event) =>
															toggleExtension(
																extension.id,
																event.target.checked,
															)
														}
													/>
													<span>
														<strong>{extension.id}</strong>
														<small>
															{extension.source} · {extension.version}
														</small>
														{extension.requires?.length ? (
															<small>
																{" "}
																{t("project.activationGroups.requires", {
																	names: extension.requires.join(", "),
																})}
															</small>
														) : null}
													</span>
													{locked && (
														<Badge tone="info">
															{t("project.activationGroups.lockedDependency")}
														</Badge>
													)}
												</label>
											);
										})}
										{(draft.extensions ?? []).length === 0 && (
											<span className="activation-groups-hint">
												{t("project.activationGroups.noExtensions")}
											</span>
										)}
									</div>
								</>
							)}
						</section>
					</div>
				) : (
					<div className="activation-groups-loading">
						{t("project.activationGroups.loading")}
					</div>
				)}

				{showPreview && draft && (
					<section className="activation-groups-panel">
						<h3>{t("project.activationGroups.previewTitle")}</h3>
						{!preview.hasChanges ? (
							<span className="activation-groups-hint">
								{t("project.activationGroups.previewNone")}
							</span>
						) : (
							<ul className="activation-groups-changes">
								{preview.activeFrom !== preview.activeTo && (
									<li>
										{t("project.activationGroups.previewActiveChange", {
											from: preview.activeFrom || "—",
											to: preview.activeTo || "—",
										})}
									</li>
								)}
								{preview.renamed.map((entry) => (
									<li key={`rename-${entry.from}`}>
										{t("project.activationGroups.previewGroupRenamed", {
											from: entry.from,
											to: entry.to,
										})}
									</li>
								))}
								{preview.added.map((id) => (
									<li key={`add-${id}`}>
										{t("project.activationGroups.previewGroupAdded", {
											name: id,
											count: groups[id]?.extensionIds?.length ?? 0,
										})}
									</li>
								))}
								{preview.removed.map((id) => (
									<li key={`remove-${id}`}>
										{t("project.activationGroups.previewGroupRemoved", {
											name: id,
										})}
									</li>
								))}
								{preview.membershipChanged.map((id) => (
									<li key={`change-${id}`}>
										{t("project.activationGroups.previewGroupChanged", {
											name: id,
										})}
									</li>
								))}
							</ul>
						)}
					</section>
				)}

				{showDiagnostics && draft && (
					<section className="activation-groups-panel">
						<h3>{t("project.activationGroups.diagnosticsTitle")}</h3>
						{diagnostics.length === 0 ? (
							<span className="activation-groups-hint">
								{t("project.activationGroups.diagnosticsNone")}
							</span>
						) : (
							<ul className="activation-groups-diagnostics">
								{diagnostics.map((item, idx) => (
									<li key={`diag-${idx}`}>
										<Diagnostic severity={item.severity}>
											{item.message}
										</Diagnostic>
									</li>
								))}
							</ul>
						)}
					</section>
				)}

				{error && <Diagnostic severity="error">{error}</Diagnostic>}

				<footer className="modal-footer">
					<Button
						variant="ghost"
						icon={<Eye size={14} />}
						onClick={() => {
							setShowPreview((value) => !value);
							setShowDiagnostics(false);
						}}
						disabled={busy}
					>
						{t("project.activationGroups.preview")}
					</Button>
					<Button
						variant="ghost"
						icon={<AlertTriangle size={14} />}
						onClick={() => {
							setShowDiagnostics((value) => !value);
							setShowPreview(false);
						}}
						disabled={busy}
					>
						{t("project.activationGroups.diagnostics")}
						{errorCount > 0 && <Badge tone="danger">{errorCount}</Badge>}
						{errorCount === 0 && warningCount > 0 && (
							<Badge tone="warning">{warningCount}</Badge>
						)}
					</Button>
					<Button onClick={onClose} disabled={busy}>
						{t("project.activationGroups.cancel")}
					</Button>
					<Button
						variant="primary"
						onClick={() => void apply()}
						disabled={!draft || busy || errorCount > 0}
					>
						{t("project.activationGroups.apply")}
					</Button>
				</footer>
			</div>
		</div>
	);
}

function findCycle(
	nodes: readonly string[],
	edges: (node: string) => readonly string[],
): string[] | null {
	const WHITE = 0;
	const GRAY = 1;
	const BLACK = 2;
	const color = new Map<string, number>();
	for (const node of nodes) color.set(node, WHITE);
	const stack: string[] = [];
	const visit = (node: string): string[] | null => {
		color.set(node, GRAY);
		stack.push(node);
		for (const next of edges(node)) {
			if (!color.has(next)) continue;
			const state = color.get(next);
			if (state === GRAY) {
				const start = stack.indexOf(next);
				return start >= 0 ? stack.slice(start) : [next, node];
			}
			if (state === WHITE) {
				const found = visit(next);
				if (found) return found;
			}
		}
		stack.pop();
		color.set(node, BLACK);
		return null;
	};
	for (const node of nodes) {
		if (color.get(node) === WHITE) {
			const found = visit(node);
			if (found) return found;
		}
	}
	return null;
}
