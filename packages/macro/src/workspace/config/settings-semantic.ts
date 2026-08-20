import type {
	TemplateAnalysis,
	ValueTokenDescriptor,
} from "../../values/token-spec";
import type { SettingsDiagnostic } from "./settings-service";

export interface SettingsPreviewRequest {
	readonly requestId: string;
	readonly settingsRevision: string;
	readonly path: readonly string[];
	readonly draftValue: unknown;
	readonly effectiveSettings: Readonly<Record<string, unknown>>;
	readonly draftSettings?: Readonly<Record<string, unknown>>;
	readonly sampleInput?: string;
}

export interface SettingsSampleResult {
	readonly input: string;
	readonly matched: boolean;
	readonly value?: unknown;
	readonly formatted?: string;
}

export interface SettingsSemanticDescriptor {
	readonly providerId: string;
	readonly tokenDomain?: string;
	readonly supportsSampleInput: boolean;
	readonly supportsTokenCatalog: boolean;
}

export interface SettingsPreviewResult {
	readonly requestId: string;
	readonly settingsRevision: string;
	readonly providerId: string;
	readonly status: "valid" | "invalid" | "unsupported";
	readonly diagnostics: readonly SettingsDiagnostic[];
	readonly tokenDescriptors?: readonly ValueTokenDescriptor[];
	readonly templateAnalysis?: readonly TemplateAnalysis[];
	readonly sample?: SettingsSampleResult;
}

export interface SettingsSemanticProvider {
	readonly id: string;
	readonly settingPaths: readonly (readonly string[])[];
	describe?(): SettingsSemanticDescriptor;
	preview(
		request: SettingsPreviewRequest,
	): SettingsPreviewResult | Promise<SettingsPreviewResult>;
}

export class SettingsSemanticRegistry {
	private readonly providers = new Map<string, SettingsSemanticProvider>();

	register(provider: SettingsSemanticProvider): this {
		if (this.providers.has(provider.id))
			throw new Error(`Duplicate settings semantic provider: ${provider.id}`);
		this.providers.set(provider.id, provider);
		return this;
	}

	getForPath(path: readonly string[]): SettingsSemanticProvider | undefined {
		return [...this.providers.values()].find((provider) =>
			provider.settingPaths.some(
				(candidate) =>
					candidate.length === path.length &&
					candidate.every((part, index) => part === path[index]),
			),
		);
	}

	getAll(): readonly SettingsSemanticProvider[] {
		return [...this.providers.values()];
	}
}
