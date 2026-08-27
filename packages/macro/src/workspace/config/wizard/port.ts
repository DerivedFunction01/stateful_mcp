import type {
	SettingsScope,
	ValueAuthoringProfileDto,
	ValueAuthoringResult,
	ValueCatalogDto,
	ValueRequestDto,
	ValueSampleDto,
} from "@stateful-mcp/macro-protocol";

/**
 * Narrow transport boundary for the wizard model. The model never imports a
 * concrete host client; Phase 4 supplies the browser adapter.
 */
export interface WizardAuthoringPreviewOptions {
	readonly samples?: readonly ValueSampleDto[];
	readonly request?: ValueRequestDto;
	readonly expectedRevision?: string;
}

export interface WizardAuthoringPort {
	load(profileId: string): Promise<ValueAuthoringResult>;
	validate(profile: ValueAuthoringProfileDto): Promise<ValueAuthoringResult>;
	preview(
		profile: ValueAuthoringProfileDto,
		options?: WizardAuthoringPreviewOptions,
	): Promise<ValueAuthoringResult>;
	save(
		profile: ValueAuthoringProfileDto,
		expectedRevision: string,
	): Promise<ValueAuthoringResult>;
	/**
	 * Future activation extension point. Activation is always explicit;
	 * absent capability means renderers show the action as unavailable.
	 */
	activate?(profileId: string, expectedProjectRevision?: string): Promise<void>;
}

export type WizardPortOp = "load" | "validate" | "preview" | "save";

export interface RecordedWizardCall {
	readonly op: WizardPortOp;
	readonly payload: unknown;
}

/** Controllable promise for modeling out-of-order transport responses. */
export function createDeferred<T>(): {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
} {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

export interface FixtureWizardPortSpec {
	/** Local-layer profiles by ID, mirroring what the host persists per profile. */
	readonly profiles?: Readonly<Record<string, ValueAuthoringProfileDto>>;
	/** Settings revisions by profile ID; bumped deterministically on save. */
	readonly revisions?: Readonly<Record<string, string>>;
	/** Catalog carried alongside load results. */
	readonly catalog?: ValueCatalogDto;
	/** Scopes this fixture reports unsupported (surfacing only; never transported). */
	readonly scopeUnsupported?: readonly SettingsScope[];
	/** Replace any method to script custom outcomes, delays, or throws. */
	readonly loadImpl?: (
		port: FixtureScriptHooks,
		profileId: string,
	) => Promise<ValueAuthoringResult>;
	readonly validateImpl?: (
		port: FixtureScriptHooks,
		profile: ValueAuthoringProfileDto,
	) => Promise<ValueAuthoringResult>;
	readonly previewImpl?: (
		port: FixtureScriptHooks,
		profile: ValueAuthoringProfileDto,
		options?: WizardAuthoringPreviewOptions,
	) => Promise<ValueAuthoringResult>;
	readonly saveImpl?: (
		port: FixtureScriptHooks,
		profile: ValueAuthoringProfileDto,
		expectedRevision: string,
	) => Promise<ValueAuthoringResult>;
	readonly activate?: (
		profileId: string,
		expectedProjectRevision?: string,
	) => Promise<void>;
}

/**
 * Mutable scripting surface handed to fixture impls so tests can stage
 * deferred responses or flip behavior between calls.
 */
export interface FixtureScriptHooks {
	deferred<T>(): {
		promise: Promise<T>;
		resolve(value: T): void;
		reject(error: unknown): void;
	};
}

function fixtureDraft(profile: ValueAuthoringProfileDto) {
	return {
		profile,
		revision: "",
		dirty: false,
		diagnostics: [] as never[],
		compileStatus: "valid" as const,
		graphFingerprint: "fixture-graph",
	};
}

function malformed(): ValueAuthoringResult {
	return {
		status: "conflict",
		code: "REQUEST_PAYLOAD_MALFORMED",
		messageKey: "request.payload.malformed",
	};
}

function bumpRevision(revision: string): string {
	const match = /(\d+)$/.exec(revision);
	if (!match?.[1]) return `${revision}-2`;
	const next = String(Number(match[1]) + 1).padStart(match[1].length, "0");
	return `${revision.slice(0, match.index ?? 0)}${next}`;
}

/**
 * Builds an in-memory authoring port over fixture DTOs with deterministic
 * server-shaped outcomes, recording every transport call for assertions.
 */
export function createFixtureAuthoringPort(spec: FixtureWizardPortSpec = {}): {
	port: WizardAuthoringPort;
	calls: RecordedWizardCall[];
	revisions: Record<string, string>;
	scopeUnsupported: SettingsScope[];
	profiles: Record<string, ValueAuthoringProfileDto>;
	catalog: ValueCatalogDto | undefined;
} {
	const calls: RecordedWizardCall[] = [];
	const profiles: Record<string, ValueAuthoringProfileDto> = {
		...(spec.profiles ?? {}),
	};
	const revisions: Record<string, string> = { ...(spec.revisions ?? {}) };
	const scopeUnsupported: SettingsScope[] = [...(spec.scopeUnsupported ?? [])];
	const hooks: FixtureScriptHooks = { deferred: () => createDeferred() };

	function requireId(profile: ValueAuthoringProfileDto): string | null {
		return typeof profile?.id === "string" && profile.id ? profile.id : null;
	}

	function hasAuthoredCollections(profile: ValueAuthoringProfileDto): boolean {
		const dateTime = profile.values?.dateTime as
			| Record<string, unknown>
			| undefined;
		const formats = (dateTime?.formats ?? {}) as Record<string, unknown>;
		return (
			(profile.aliases?.length ?? 0) > 0 ||
			(profile.fundamentals?.length ?? 0) > 0 ||
			(profile.recipes?.length ?? 0) > 0 ||
			Object.keys(formats).length > 0
		);
	}

	async function load(profileId: string): Promise<ValueAuthoringResult> {
		calls.push({ op: "load", payload: { profileId } });
		if (spec.loadImpl) return spec.loadImpl(hooks, profileId);
		const stored = profiles[profileId];
		if (!stored || typeof stored !== "object") return malformed();
		const revision = revisions[profileId] ?? `rev-${profileId}`;
		return {
			status: "loaded",
			settingsRevision: revision,
			draft: {
				profile: structuredClone(stored),
				dirty: false,
				diagnostics: [],
				compileStatus: hasAuthoredCollections(stored) ? "valid" : "empty",
				graphFingerprint: "fixture-graph",
				revision,
			},
			catalog: spec.catalog,
		};
	}

	async function validate(
		profile: ValueAuthoringProfileDto,
	): Promise<ValueAuthoringResult> {
		calls.push({ op: "validate", payload: { profile } });
		if (spec.validateImpl) return spec.validateImpl(hooks, profile);
		if (requireId(profile) === null) return malformed();
		return {
			status: "validated",
			validation: {
				valid: true,
				diagnostics: [],
				graphFingerprint: "fixture-graph",
			},
			catalog: spec.catalog,
		};
	}

	async function preview(
		profile: ValueAuthoringProfileDto,
		options?: WizardAuthoringPreviewOptions,
	): Promise<ValueAuthoringResult> {
		calls.push({
			op: "preview",
			payload: { profile, options },
		});
		if (spec.previewImpl) return spec.previewImpl(hooks, profile, options);
		if (requireId(profile) === null) return malformed();
		return {
			status: "previewed",
			settingsRevision: revisions[requireId(profile) ?? ""] ?? "rev-unknown",
			draft: fixtureDraft(structuredClone(profile)),
			preview: {
				graphFingerprint: "fixture-graph",
				samples: (options?.samples ?? []).map((sample) => ({
					input: sample.input,
					argumentId: sample.argumentId,
					matched: true,
					recipeId: options?.request?.valueKind
						? `recipe-${options.request.valueKind}`
						: undefined,
					captures: {},
					diagnostics: [],
				})),
			},
		};
	}

	async function save(
		profile: ValueAuthoringProfileDto,
		expectedRevision: string,
	): Promise<ValueAuthoringResult> {
		calls.push({ op: "save", payload: { profile, expectedRevision } });
		if (spec.saveImpl) return spec.saveImpl(hooks, profile, expectedRevision);
		const id = requireId(profile);
		if (id === null) return malformed();
		const actual = revisions[id] ?? `rev-${id}`;
		if (actual !== expectedRevision) {
			return {
				status: "conflict",
				code: "SETTINGS_REVISION_STALE",
				messageKey: "settings.bundle.stale",
				expectedRevision,
				actualRevision: actual,
			};
		}
		const savedRevision = bumpRevision(actual);
		revisions[id] = savedRevision;
		profiles[id] = structuredClone(profile);
		return {
			status: "saved",
			settingsRevision: savedRevision,
			draft: {
				profile: structuredClone(profile),
				dirty: false,
				diagnostics: [],
				compileStatus: "valid",
				graphFingerprint: "fixture-graph",
				revision: savedRevision,
			},
		};
	}

	return {
		port: {
			load,
			validate,
			preview,
			save,
			activate: spec.activate,
		},
		calls,
		revisions,
		scopeUnsupported,
		profiles,
		catalog: spec.catalog,
	};
}
