import type {
	ValueAuthoringWizardState,
	ValueAuthoringWizardStore,
	WizardCollectionKey,
} from "@stateful-mcp/macro/workspace/config/wizard";
import { useI18n } from "../../lib/macro-i18n-provider";
import { Badge, Button } from "../ui/primitives";
import { ProvenanceBadge } from "./ProvenanceBadge";

const COLLECTION_TITLE_KEY: Record<WizardCollectionKey, string> = {
	aliases: "valueStudio.scope.collection.aliases",
	fundamentals: "valueStudio.scope.collection.fundamentals",
	recipes: "valueStudio.scope.collection.recipes",
	dateTimeFormats: "valueStudio.scope.collection.formats",
};

function countEntries(
	state: ValueAuthoringWizardState,
	kind: WizardCollectionKey,
): number {
	const source = state.localProfile as unknown as Record<
		string,
		readonly unknown[]
	> | null;
	return source?.[kind]?.length ?? 0;
}

export function ScopeProfileStep({
	state,
	store,
}: {
	readonly state: ValueAuthoringWizardState;
	readonly store: ValueAuthoringWizardStore;
}) {
	const { t } = useI18n();
	const entries = store.view.stableIdEntries();

	const startEditing = (profileId: string) => {
		void store.actions.startEdit(profileId);
	};

	if (!state.ready) {
		return (
			<div className="vs-step">
				<h3>{t("valueStudio.step.scopeProfile.title")}</h3>
				<p>{t("valueStudio.scope.pickPrompt")}</p>
				{state.availableProfiles.length === 0 ? (
					<div className="vs-new-profile">
						<p>{t("valueStudio.scope.emptyStore")}</p>
						<Button
							variant="primary"
							onClick={() => store.actions.startNewLocal({ id: "local" })}
						>
							{t("valueStudio.scope.createLocal")}
						</Button>
					</div>
				) : (
					<ul className="vs-profile-options">
						{state.availableProfiles.map((profile) => (
							<li key={profile.id}>
								<Button onClick={() => startEditing(profile.id)}>
									{t("valueStudio.scope.editProfile", {
										profile: profile.label ?? profile.id,
									})}
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		);
	}

	return (
		<div className="vs-step">
			<h3>{t("valueStudio.step.scopeProfile.title")}</h3>
			<section className="vs-scope-lineage">
				<h4>{t("valueStudio.scope.lineage")}</h4>
				<p className="vs-lineage-chain">
					<code>{state.editedProfileId}</code>
					{state.editedExtendsId && (
						<>
							{" "}
							<span aria-hidden="true">↳</span>{" "}
							<code>{state.editedExtendsId}</code>
						</>
					)}
					{state.parentMissing && (
						<Badge tone="warning">
							{t("settings.valueAuthoring.parentMissing")}
						</Badge>
					)}
				</p>
			</section>

			<section className="vs-collection-counts">
				<h4>{t("valueStudio.scope.collections")}</h4>
				<ul>
					{(Object.keys(COLLECTION_TITLE_KEY) as WizardCollectionKey[]).map(
						(kind) => (
							<li key={kind}>
								{t(COLLECTION_TITLE_KEY[kind] as never)}:{" "}
								<strong>{countEntries(state, kind)}</strong>
								{state.inheritedEntryIds[kind].length > 0 && (
									<span className="vs-inherited-count">
										{" "}
										({t("valueStudio.provenance.inheritedShort")}{" "}
										{state.inheritedEntryIds[kind].length})
									</span>
								)}
							</li>
						),
					)}
				</ul>
			</section>

			<section className="vs-stable-entries">
				<h4>{t("valueStudio.scope.entriesTitle")}</h4>
				{entries.length === 0 ? (
					<p className="vs-empty-note">{t("valueStudio.scope.noEntries")}</p>
				) : (
					<ul className="vs-entry-rows">
						{entries.map((entry) => (
							<li key={`${entry.kind}:${entry.id}`} className="vs-entry-row">
								<ProvenanceBadge provenance={entry.provenance} />
								<code className="vs-entry-id">{entry.id}</code>
								<div className="vs-entry-actions">
									{entry.inheritedDefinition ? (
										<>
											<Button
												variant="ghost"
												onClick={() =>
													store.actions.updateCollectionEntry(
														entry.kind,
														entry.id,
														{},
													)
												}
											>
												{t("valueStudio.scope.action.override")}
											</Button>
											<Button
												variant="ghost"
												onClick={() =>
													store.actions.resetToInherited(entry.kind, entry.id)
												}
											>
												{t("valueStudio.scope.action.reset")}
											</Button>
										</>
									) : null}
									<Button
										variant="ghost"
										onClick={() =>
											store.actions.setCollectionEntryEnabled(
												entry.kind,
												entry.id,
												entry.provenance === "disabled",
											)
										}
									>
										{entry.provenance === "disabled"
											? t("valueStudio.scope.action.enable")
											: t("valueStudio.scope.action.disable")}
									</Button>
									<Button
										variant="danger"
										onClick={() =>
											store.actions.removeFromCollection(entry.kind, entry.id)
										}
									>
										{t("valueStudio.scope.action.remove")}
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
