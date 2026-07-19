const serviceType = process.env.SERVICE_TYPE || process.argv[2] || "filter";

console.error(`[Monolith Router] Starting service: ${serviceType}`);

if (serviceType === "filter") {
  import("./src/services/filter");
} else if (serviceType === "object") {
  import("./src/services/object");
} else if (serviceType === "dictionary") {
  import("./src/services/dictionary");
} else if (serviceType === "log") {
  import("./src/services/log");
} else {
  console.error(`[Error] Unknown SERVICE_TYPE: "${serviceType}". Must be: "filter", "object", "dictionary", or "log"`);
  process.exit(1);
}