import { defineExtension } from "../../../packages/macro/src/index.ts";

export default defineExtension({
	id: "sample.runtime",
	version: "1.0.0",
	contributes: {
		viewsContainers: {
			activitybar: [
				{
					id: "sample",
					titleI18nKey: "workbench.explorer",
					icon: "◇",
					altKey: "6",
				},
			],
		},
		views: {
			sample: [
				{
					id: "sample.runtime.view",
					name: "Runtime sample",
					containerId: "sample",
				},
			],
		},
		commands: [
			{
				command: "sample.runtime.ping",
				titleI18nKey: "workbench.explorer",
				categoryI18nKey: "palette.category.general",
				verb: "sampleping",
			},
		],
		settings: [
			{
				namespace: "sample.runtime",
				title: "Sample Runtime",
				schema: [{ path: ["enabled"], type: "boolean", title: "Enabled" }],
				defaults: { enabled: true },
			},
		],
	},
	activate() {
		return {
			contributions: {
				views: { "sample.runtime.view": { render: () => null } },
				commands: {
					"sample.runtime.ping": {
						execute: () => ({ ok: true, extension: "sample.runtime" }),
					},
				},
			},
		};
	},
});
