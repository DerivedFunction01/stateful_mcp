import type { WindowDefinition, WindowSlot } from "./cell-editor";

export const PLAN_SLOTS: WindowSlot[] = [
	"primary",
	"command",
	"status",
	"footer",
	"sidebar",
	"overlay",
];

/**
 * Fake plan window definition used to prove the region/extension model supports
 * future windows without modifying `WindowContainer`. It adds a `sidebar`
 * region that the notebook window does not use.
 */
export function planWindow(): WindowDefinition {
	return {
		type: "plan",
		regions: () => [
			{
				slot: "primary",
				key: "plan-primary",
				render: () => null,
			},
			{
				slot: "sidebar",
				key: "plan-sidebar",
				render: () => null,
			},
			{
				slot: "command",
				key: "plan-command",
				render: () => null,
			},
			{
				slot: "status",
				key: "plan-status",
				render: () => null,
			},
			{
				slot: "footer",
				key: "plan-footer",
				render: () => null,
			},
		],
	};
}
