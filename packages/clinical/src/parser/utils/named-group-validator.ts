import type { NamedGroupContract } from "../../store/interfaces";

export class NamedGroupContractError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NamedGroupContractError";
	}
}

export function validateNamedGroups(
	groups: Record<string, string | undefined>,
	contract: NamedGroupContract | undefined,
): void {
	if (!contract) return;

	const present = Object.keys(groups).filter((k) => groups[k] !== undefined);

	if (contract.required) {
		for (const req of contract.required) {
			if (!present.includes(req)) {
				throw new NamedGroupContractError(
					`Missing required named group: ${req}`,
				);
			}
		}
	}

	if (contract.allowed) {
		const unknown = present.filter((g) => !contract.allowed!.includes(g));
		if (unknown.length > 0) {
			throw new NamedGroupContractError(
				`Unknown named groups not in contract: ${unknown.join(", ")}`,
			);
		}
	}

	if (contract.disallowed) {
		const bad = present.filter((g) => contract.disallowed!.includes(g));
		if (bad.length > 0) {
			throw new NamedGroupContractError(
				`Disallowed named groups: ${bad.join(", ")}`,
			);
		}
	}
}