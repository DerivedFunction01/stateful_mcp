import type {
	LearningObservationMode,
	LearningOutcome,
	MacroTransitionObservation,
	MacroTransitionStore,
	SystemWeightStore,
} from "./interfaces";
import type {
	MacroLearningCandidate,
	MacroLearningRankedCandidate,
	MacroLearningRankingContext,
	MacroLearningTrace,
} from "./macro-learning-types";
import { buildMacroLearningFeatures } from "./macro-learning-types";
import type { MacroParseLearningStore } from "./macro-parse-learning-store";

const START = "START";
const END = "END";
const EPSILON = 1e-9;

export interface MacroLearningServiceDeps {
	transitionStore: MacroTransitionStore;
	weightStore: SystemWeightStore;
	parseStore?: MacroParseLearningStore;
}

export class MacroLearningService {
	constructor(private readonly deps: MacroLearningServiceDeps) {}

	async recordTrace(trace: MacroLearningTrace): Promise<void> {
		const mode = trace.observationMode ?? "execution";
		const outcome = trace.outcome ?? "positive";
		if (outcome === "negative") return;
		const scopes = trace.personnelId
			? [
					{ scope: "personal" as const, scopeKey: trace.personnelId },
					{ scope: "global" as const, scopeKey: "all" },
				]
			: [{ scope: "global" as const, scopeKey: "all" }];
		const sequence = [
			START,
			...trace.arguments.map((argument) => argument.argumentId),
			END,
		];

		for (const scope of scopes) {
			for (let index = 0; index < sequence.length - 1; index += 1) {
				const fromSlot = sequence[index]!;
				const toSlot = sequence[index + 1]!;
				const argument = trace.arguments.find(
					(item) => item.argumentId === toSlot,
				);
				const features = argument?.features ?? [
					{ key: "argument.kind", value: null, numericalValue: null },
				];
				for (const feature of features) {
					const observation: MacroTransitionObservation = {
						macroId: trace.macroId,
						macroVersion: trace.macroVersion,
						fromSlot,
						toSlot,
						featureKey: feature.key,
						featureValue: feature.value,
						numericalValue: feature.numericalValue,
						scope: scope.scope,
						scopeKey: scope.scopeKey,
						observationMode: mode,
						outcome,
						occurredAt: new Date().toISOString(),
						sessionId: trace.sessionId,
						observationId:
							feature.numericalValue !== null && trace.correlationId
								? `${trace.correlationId}:${scope.scope}:${index}:${feature.key}`
								: undefined,
					};
					await this.deps.transitionStore.increment(observation);
				}
			}
		}
	}

	async recordFeedback(
		trace: MacroLearningTrace,
		outcome: LearningOutcome,
	): Promise<void> {
		await this.recordTrace({ ...trace, outcome });
	}

	async applyRankingFeedback(input: {
		positive: Record<string, number>;
		negative?: Record<string, number>;
		correlationId?: string;
		learningRate?: number;
	}): Promise<void> {
		const updates = [
			...Object.entries(input.positive),
			...Object.entries(input.negative ?? {}).map(
				([key, value]) => [key, -value] as const,
			),
		];
		for (const [feature, delta] of updates) {
			await this.deps.weightStore.applyFeedback({
				category: "macro.rank",
				key: "feature",
				subKey: feature,
				delta,
				learningRate: input.learningRate,
				signal: delta >= 0 ? "positive" : "negative",
				correlationId: input.correlationId
					? `${input.correlationId}:${feature}`
					: undefined,
			});
		}
	}

	async rankCandidates<T extends MacroLearningCandidate>(
		context: MacroLearningRankingContext,
		candidates: readonly T[],
	): Promise<MacroLearningRankedCandidate<T>[]> {
		if (candidates.length === 0) return [];
		const modes = context.observationModes ?? ["live"];
		const policy = await this.readPolicyWeights();
		const scopes = context.personnelId
			? [
					{
						scope: "personal" as const,
						scopeKey: context.personnelId,
						weight: policy.scopePersonal,
					},
					{
						scope: "global" as const,
						scopeKey: "all",
						weight: policy.scopeGlobal,
					},
				]
			: [{ scope: "global" as const, scopeKey: "all", weight: 1 }];
		const totalCandidates = candidates.length;
		const ranked: MacroLearningRankedCandidate<T>[] = [];

		for (const candidate of candidates) {
			const features =
				candidate.features ??
				(candidate.value ? buildMacroLearningFeatures(candidate.value) : []);
			let transitionScore = 0;
			let numericScore = 0;
			let numericWeight = 0;
			for (const scope of scopes) {
				for (const mode of modes) {
					const query = {
						macroId: context.macroId,
						macroVersion: context.macroVersion,
						fromSlot: context.previousSlot ?? START,
						scope: scope.scope,
						scopeKey: scope.scopeKey,
						observationModes: [mode],
						toSlots: [candidate.argumentId],
					};
					const rows = await this.deps.transitionStore.getByFromSlot(query);
					const count = rows.reduce((sum, row) => sum + row.transitionCount, 0);
					const probability = (count + 1) / (count + totalCandidates);
					transitionScore +=
						scope.weight * modeWeight(policy, mode) * probability;

					const numericFeature = features.find(
						(feature) =>
							feature.key === "measurement.value" &&
							feature.numericalValue !== null,
					);
					if (
						numericFeature?.numericalValue !== null &&
						numericFeature?.numericalValue !== undefined
					) {
						const stats = await this.deps.transitionStore.getNumericStatistics({
							...query,
							featureKey: "measurement.value",
							featureValue: numericFeature.value,
						});
						const distribution = stats[candidate.argumentId];
						if (distribution && distribution.count >= 2) {
							const z =
								Math.abs(numericFeature.numericalValue - distribution.mean) /
								Math.max(
									distribution.standardDeviationPopulation ?? 0,
									EPSILON,
								);
							numericScore +=
								scope.weight * modeWeight(policy, mode) * (1 / (1 + z));
							numericWeight += scope.weight * modeWeight(policy, mode);
						}
					}
				}
			}
			ranked.push({
				candidate,
				score:
					policy.transition * transitionScore +
					policy.numericFit *
						(numericWeight ? numericScore / numericWeight : 0),
				features: {
					transition: transitionScore,
					numericFit: numericWeight ? numericScore / numericWeight : 0,
				},
			});
		}
		return ranked.sort(
			(a, b) =>
				b.score - a.score ||
				a.candidate.argumentId.localeCompare(b.candidate.argumentId),
		);
	}

	private async readPolicyWeights() {
		const get = (key: string, fallback: number) =>
			this.deps.weightStore
				.getWeight("macro.rank", "feature", key)
				.then((value) => value ?? fallback);
		return {
			scopePersonal: await this.deps.weightStore.getWeight(
				"macro.transition",
				"scope",
				"personal",
			),
			scopeGlobal: await this.deps.weightStore.getWeight(
				"macro.transition",
				"scope",
				"global",
			),
			modeLive: await this.deps.weightStore.getWeight(
				"macro.transition",
				"mode",
				"live",
			),
			modePreview: await this.deps.weightStore.getWeight(
				"macro.transition",
				"mode",
				"preview",
			),
			modeExecution: await this.deps.weightStore.getWeight(
				"macro.transition",
				"mode",
				"execution",
			),
			transition: await get("transition", 1),
			numericFit: await get("numericFit", 1),
		};
	}
}

function modeWeight(
	policy: { modeLive?: number; modePreview?: number; modeExecution?: number },
	mode: LearningObservationMode,
): number {
	return mode === "live"
		? (policy.modeLive ?? 0.25)
		: mode === "preview"
			? (policy.modePreview ?? 0.5)
			: (policy.modeExecution ?? 1);
}
