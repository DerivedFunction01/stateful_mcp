import type { MacroRunMode } from "../contracts/macro";
import type { MacroDraftDiagnostic } from "../contracts/slots";
import type { MacroExecutionAttempt } from "../history/contracts";
import type { MacroListenerOutput } from "../listeners/listener-registry";

export interface MacroRenderContext {
	mode: MacroRunMode;
	sequence?: number;
	listenerOutputs: readonly MacroListenerOutput[];
}

export interface MacroRenderOutput {
	rendererId: string;
	text?: string;
	json?: unknown;
	diagnostics?: MacroDraftDiagnostic[];
}

type RendererOutputValue = Omit<MacroRenderOutput, "rendererId"> &
	Partial<Pick<MacroRenderOutput, "rendererId">>;

export interface MacroOutputRenderer {
	id: string;
	order?: number;
	supports(event: MacroExecutionAttempt): boolean;
	render(
		event: MacroExecutionAttempt,
		context: MacroRenderContext,
	): RendererOutputValue | undefined | Promise<RendererOutputValue | undefined>;
}

export class MacroRendererRegistry {
	private readonly renderers = new Map<string, MacroOutputRenderer>();

	register(renderer: MacroOutputRenderer): void {
		if (this.renderers.has(renderer.id))
			throw new Error(`Renderer '${renderer.id}' is already registered`);
		this.renderers.set(renderer.id, renderer);
	}

	list(): readonly MacroOutputRenderer[] {
		return [...this.renderers.values()].sort(
			(left, right) =>
				(left.order ?? 0) - (right.order ?? 0) ||
				left.id.localeCompare(right.id),
		);
	}

	async render(
		event: MacroExecutionAttempt,
		context: MacroRenderContext,
	): Promise<{
		outputs: MacroRenderOutput[];
		diagnostics: MacroDraftDiagnostic[];
	}> {
		const outputs: MacroRenderOutput[] = [];
		const diagnostics: MacroDraftDiagnostic[] = [];
		for (const renderer of [...this.list()]) {
			try {
				if (!renderer.supports(event)) continue;
				const output = await renderer.render(event, context);
				if (output) outputs.push({ ...output, rendererId: renderer.id });
			} catch (error) {
				diagnostics.push({
					code: "RENDERER_FAILED",
					messageKey: "errors.rendererFailed",
					messageParams: {
						rendererId: renderer.id,
						detail: error instanceof Error ? error.message : String(error),
					},
				});
			}
		}
		return { outputs, diagnostics };
	}
}

export function normalizeMacroOutput(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(normalizeMacroOutput);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => [key, normalizeMacroOutput(item)]),
	);
}

export function normalizeMacroOutputs(
	outputs: readonly (MacroRenderOutput | MacroListenerOutput)[],
): unknown[] {
	return outputs.map((output) => normalizeMacroOutput(output));
}

export function rendererOutputFingerprint(
	outputs: readonly (MacroRenderOutput | MacroListenerOutput)[],
): string {
	return JSON.stringify(normalizeMacroOutputs(outputs));
}
