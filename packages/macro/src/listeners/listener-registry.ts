import type { ParseListener } from "../contracts/listeners";
import type { MacroDraftDiagnostic } from "../contracts/slots";
import type { MacroExecutionAttempt } from "../history/contracts";

export interface MacroListenerContext {
	mode: "execute" | "replay";
	sequence?: number;
	history: readonly MacroExecutionAttempt[];
}

export interface MacroListenerOutput {
	listenerId: string;
	text?: string;
	json?: unknown;
	diagnostics?: MacroDraftDiagnostic[];
}

type ListenerOutputValue = Omit<MacroListenerOutput, "listenerId"> &
	Partial<Pick<MacroListenerOutput, "listenerId">>;

export interface MacroEventListener {
	id: string;
	order?: number;
	when?(event: MacroExecutionAttempt): boolean;
	onParsed(
		event: MacroExecutionAttempt,
		context: MacroListenerContext,
	): ListenerOutputValue | undefined | Promise<ListenerOutputValue | undefined>;
}

export class MacroListenerRegistry {
	private readonly listeners = new Map<string, MacroEventListener>();

	register(listener: MacroEventListener): void {
		if (this.listeners.has(listener.id))
			throw new Error(`Listener '${listener.id}' is already registered`);
		this.listeners.set(listener.id, listener);
	}

	registerParseListener(listener: ParseListener): void {
		this.register(adaptParseListener(listener));
	}

	registerAll(listeners: readonly MacroEventListener[]): void {
		for (const listener of listeners) this.register(listener);
	}

	remove(id: string): boolean {
		return this.listeners.delete(id);
	}

	clear(): void {
		this.listeners.clear();
	}

	list(): readonly MacroEventListener[] {
		return [...this.listeners.values()].sort(compareOrdered);
	}

	async dispatch(
		event: MacroExecutionAttempt,
		context: MacroListenerContext,
	): Promise<{
		outputs: MacroListenerOutput[];
		diagnostics: MacroDraftDiagnostic[];
	}> {
		const outputs: MacroListenerOutput[] = [];
		const diagnostics: MacroDraftDiagnostic[] = [];
		for (const listener of [...this.list()]) {
			let selected = true;
			try {
				selected = listener.when?.(event) ?? true;
			} catch (error) {
				diagnostics.push(listenerDiagnostic(listener.id, error));
				continue;
			}
			if (!selected) continue;
			try {
				const output = await listener.onParsed(event, context);
				if (output) outputs.push({ ...output, listenerId: listener.id });
			} catch (error) {
				diagnostics.push(listenerDiagnostic(listener.id, error));
			}
		}
		return { outputs, diagnostics };
	}
}

export function adaptParseListener(
	listener: ParseListener,
): MacroEventListener {
	return {
		id: listener.id,
		when: (event) => {
			const payload = event.payload;
			return payload ? (listener.when?.(payload) ?? true) : false;
		},
		onParsed: (event, context) => {
			if (!event.payload) return undefined;
			const output = listener.onParsed(event.payload, {
				history: context.history.flatMap((item) =>
					item.payload ? [item.payload] : [],
				),
			});
			if (!output) return undefined;
			return {
				text: output.text,
				json: output.json,
				diagnostics: output.diagnostics?.map((message) => ({
					code: "PARSE_LISTENER_DIAGNOSTIC",
					message,
				})),
			};
		},
	};
}

function compareOrdered(
	left: { id: string; order?: number },
	right: { id: string; order?: number },
): number {
	return (
		(left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)
	);
}

function listenerDiagnostic(id: string, error: unknown): MacroDraftDiagnostic {
	return {
		code: "LISTENER_FAILED",
		message: `Listener '${id}' failed: ${error instanceof Error ? error.message : String(error)}`,
	};
}
