import { normalizeBrowserChord } from "./bindings";
import {
	type BrowserShortcutPolicy,
	classifyChord,
} from "./browser-shortcut-policy";

export type ShortcutValidationResult =
	| {
			readonly status: "received";
			readonly chord: string;
			readonly cancelable: boolean;
			readonly policy: BrowserShortcutPolicy;
			readonly confidence: "page-received" | "page-cancelable";
			readonly targetContext: string;
	  }
	| {
			readonly status: "timeout";
			readonly expectedChord: string;
			readonly policy: BrowserShortcutPolicy;
			readonly confidence: "not-observed";
			readonly reason: "browser-or-os-consumed" | "focus-mismatch" | "no-input";
	  }
	| {
			readonly status: "cancelled";
			readonly reason: "escape" | "focus-change" | "unrelated-input";
	  };

export interface ValidateShortcutOptions {
	readonly timeoutMs?: number;
	readonly claimPageDefault?: boolean;
	readonly context?: string;
}

const MODIFIER_KEYS = new Set(["Control", "Meta", "Shift", "Alt"]);

/**
 * Observe the next keyboard chord on the page rather than relying on the static
 * policy registry. This validates the *current* page, focus state, browser, and
 * extensions; it cannot prove control over browser chrome shortcuts. It never
 * executes a mapped Macro command while recording.
 */
export function validateShortcutInput(
	options: ValidateShortcutOptions = {},
): Promise<ShortcutValidationResult> {
	const timeoutMs = options.timeoutMs ?? 4000;
	const context = options.context ?? "global";
	return new Promise((resolve) => {
		let finished = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const cleanup = () => {
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("blur", onBlur);
			if (timer !== undefined) clearTimeout(timer);
		};
		const finish = (result: ShortcutValidationResult) => {
			if (finished) return;
			finished = true;
			cleanup();
			resolve(result);
		};

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault();
				finish({ status: "cancelled", reason: "escape" });
				return;
			}
			// Ignore modifier-only and pure focus-traversal events.
			if (MODIFIER_KEYS.has(event.key) || event.key === "Tab") return;
			// `alt` is not a first-class canonical modifier.
			if (event.altKey) {
				finish({ status: "cancelled", reason: "unrelated-input" });
				return;
			}
			const chord = normalizeBrowserChord(event);
			if (!chord) {
				finish({ status: "cancelled", reason: "unrelated-input" });
				return;
			}
			if (event.cancelable) {
				event.preventDefault();
				if (options.claimPageDefault) event.stopPropagation();
			}
			const policy = classifyChord(chord);
			finish({
				status: "received",
				chord,
				cancelable: event.cancelable,
				policy,
				confidence: event.cancelable ? "page-cancelable" : "page-received",
				targetContext: context,
			});
		};

		const onBlur = () =>
			finish({ status: "cancelled", reason: "focus-change" });

		timer = setTimeout(
			() =>
				finish({
					status: "timeout",
					expectedChord: "",
					policy: classifyChord(""),
					confidence: "not-observed",
					reason: "no-input",
				}),
			timeoutMs,
		);

		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("blur", onBlur);
	});
}
