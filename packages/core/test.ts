import { eventBroker } from "./src/events/broker";
import { runDictionaryTests } from "./tests/dictionary.test";
import { runEventTests } from "./tests/event.test";
import { runFilterTests } from "./tests/filter.test";
import { runLogTests } from "./tests/log.test";
import { runMetaTests } from "./tests/meta.test";
import { runObjectTests } from "./tests/object.test";
import { runVariableTests } from "./tests/variable.test";

async function main() {
	try {
		const capturedEvents: any[] = [];
		eventBroker.on("state:changed", (ev) => {
			capturedEvents.push(ev);
		});

		await runFilterTests();
		await runObjectTests();
		await runDictionaryTests();
		await runLogTests();
		await runEventTests();
		await runMetaTests();
		await runVariableTests();

		if (capturedEvents.length === 0) {
			throw new Error(
				"No state change events were emitted during store tests!",
			);
		}
		console.log(
			`\n✓ Event Broker verified: captured ${capturedEvents.length} state change events successfully!`,
		);

		console.log("\n🎉 All service tests passed successfully!");
	} catch (err) {
		console.error("\n❌ Test verification failed:", err);
		process.exit(1);
	}
}

main();
