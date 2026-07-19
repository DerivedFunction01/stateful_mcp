import { resolveConfigDir } from "./src/config/loader";

const serviceType = process.env.SERVICE_TYPE || process.argv[2] || "filter";

// Expose the resolved config dir so child services read config from the
// intended location (CLI flag / env / cwd fallback, in that order).
const configDir = resolveConfigDir();
process.env.STATEFUL_MCP_CONFIG_DIR = configDir;

console.error(`[Monolith Router] Starting service: ${serviceType} (config: ${configDir})`);

async function start(service: string): Promise<void> {
  switch (service) {
    case "filter":
      await import("./src/services/filter.js");
      break;
    case "object":
      await import("./src/services/object.js");
      break;
    case "dictionary":
      await import("./src/services/dictionary.js");
      break;
    case "log":
      await import("./src/services/log.js");
      break;
    case "event":
      await import("./src/services/event.js");
      break;
    default:
      console.error(`[Error] Unknown SERVICE_TYPE: "${service}". Must be: "filter", "object", "dictionary", "log", or "event"`);
      process.exit(1);
  }
}

void start(serviceType);
