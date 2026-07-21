import { runFilterTests } from "./tests/filter.test";
import { runObjectTests } from "./tests/object.test";
import { runDictionaryTests } from "./tests/dictionary.test";
import { runLogTests } from "./tests/log.test";
import { runEventTests } from "./tests/event.test";
import { runMetaTests } from "./tests/meta.test";
import { eventBroker } from "./src/events/broker";

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

    if (capturedEvents.length === 0) {
      throw new Error("No state change events were emitted during store tests!");
    }
    console.log(`\n✓ Event Broker verified: captured ${capturedEvents.length} state change events successfully!`);

    console.log("\n🎉 All service tests passed successfully!");
  } catch (err) {
    console.error("\n❌ Test verification failed:", err);
    process.exit(1);
  }
}

main();
