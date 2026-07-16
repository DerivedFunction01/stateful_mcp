import { runFilterTests } from "./tests/filter.test";
import { runObjectTests } from "./tests/object.test";
import { runDictionaryTests } from "./tests/dictionary.test";

async function main() {
  try {
    await runFilterTests();
    await runObjectTests();
    await runDictionaryTests();
    console.log("\n🎉 All service tests passed successfully!");
  } catch (err) {
    console.error("\n❌ Test verification failed:", err);
    process.exit(1);
  }
}

main();
