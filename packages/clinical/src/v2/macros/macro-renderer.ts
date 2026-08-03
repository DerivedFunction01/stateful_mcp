import type { MacroExecutionPlan } from "./macro-plan";
import type { TypedValue } from "../values/typed-value";

export interface MacroPreviewField {
	path: string;
	label: string;
	value: string;
}

export interface MacroPreview {
	groupId: string;
	scopeKind: string;
	lines: string[];
	fields: MacroPreviewField[];
	fingerprint: string;
}

export function renderMacroPreview(plan: MacroExecutionPlan): MacroPreview {
	const lines: string[] = [];
	const fields: MacroPreviewField[] = [];

	for (const op of plan.operations) {
		const rendered = renderTypedValue(op.value);
		const line = `[${op.targetSchema}] ${op.targetPath} = ${rendered}`;
		lines.push(line);
		fields.push({
			path: op.targetPath,
			label: op.targetPath,
			value: rendered,
		});
	}

	return {
		groupId: plan.groupId,
		scopeKind: plan.scope.kind,
		lines,
		fields,
		fingerprint: plan.fingerprint.value,
	};
}

function renderTypedValue(value: TypedValue): string {
	switch (value.kind) {
		case "concept":
			return value.concept.display || value.concept.conceptId || "";

		case "concept_array": {
			const displays = value.concepts.map(
				(c) => c.display || c.conceptId || "",
			);
			return displays.join(", ");
		}

		case "scalar":
			return `${String(value.value)} (${value.scalarType})`;

		case "enum":
			return value.value;

	case "measurement": {
		const parts: string[] = [];
		if (value.isApproximate) {
			parts.push("~");
		}
		if (value.operator && value.operator !== "eq") {
			const opMap: Record<string, string> = {
				gt: ">",
				gte: ">=",
				lt: "<",
				lte: "<=",
			};
			parts.push(opMap[value.operator] || value.operator);
		}
		parts.push(`${value.magnitude} ${value.unit}`);
		return parts.join("");
	}

	case "temporal":
		switch (value.temporalType) {
			case "duration": {
				const measurements = (value.value as { measurements: { magnitude: number; unit: string }[] }).measurements;
				const rendered = measurements.map(
					(m) => `${m.magnitude} x ${m.unit}`,
				);
				return rendered.join(", ");
			}
			case "date":
				return (value.value as { value: string }).value;
			case "date_range":
				return "range";
			case "relative_time":
				const rt = value.value as { amount: number; unit: string };
				return `${rt.amount} ${rt.unit}`;
			case "cadence": {
				const cadence = (value.value as { kind: "cadence"; value: { cadenceType: string } }).value;
				return cadence.cadenceType;
			}
			default:
				return JSON.stringify(value.value);
		}

		case "array": {
			const items = value.items.map((item) => renderTypedValue(item));
			return items.join(", ");
		}

		case "composite": {
			const entries = Object.entries(value.values).map(
				([k, v]) => `${k}: ${renderTypedValue(v)}`,
			);
			return `{ ${entries.join(", ")} }`;
		}

		default:
			return JSON.stringify(value);
	}
}
