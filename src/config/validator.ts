import type { MiddlewareConfig, ResourceLocator, ToolConfig } from "./types";

function validateLocator(locator: any, context: string): void {
  if (!locator || typeof locator !== "object") {
    throw new Error(`Validation Error: ${context} must be a valid ResourceLocator object.`);
  }

  const { _type } = locator;
  if (!_type || !["adapter", "file", "remote_url"].includes(_type)) {
    throw new Error(`Validation Error: ${context} has invalid or missing _type "${_type}". Must be "adapter", "file", or "remote_url".`);
  }

  if (_type === "adapter") {
    if (typeof locator.name !== "string" || !locator.name) {
      throw new Error(`Validation Error: ${context} is an adapter but is missing a valid "name".`);
    }
  } else if (_type === "file") {
    if (typeof locator.path !== "string" || !locator.path) {
      throw new Error(`Validation Error: ${context} is a file locator but is missing a valid "path".`);
    }
  } else if (_type === "remote_url") {
    if (typeof locator.url !== "string" || !locator.url) {
      throw new Error(`Validation Error: ${context} is a remote_url locator but is missing a valid "url".`);
    }
  }
}

export function validateMiddlewareConfig(config: any): asserts config is MiddlewareConfig {
  if (!config || typeof config !== "object") {
    throw new Error("Validation Error: Configuration must be a non-null object.");
  }

  if (config.version !== 1) {
    throw new Error(`Validation Error: Unsupported config version "${config.version}". Supported version is 1.`);
  }

  validateLocator(config.filter_session_state, "filter_session_state");

  if (!config.filter_persistent_state || typeof config.filter_persistent_state !== "object") {
    throw new Error("Validation Error: filter_persistent_state must be an object.");
  }
  validateLocator(config.filter_persistent_state.global, "filter_persistent_state.global");
  validateLocator(config.filter_persistent_state.user, "filter_persistent_state.user");

  validateLocator(config.object_session_state, "object_session_state");
  if (!config.object_persistent_state || typeof config.object_persistent_state !== "object") {
    throw new Error("Validation Error: object_persistent_state must be an object.");
  }
  validateLocator(config.object_persistent_state.global, "object_persistent_state.global");
  validateLocator(config.object_persistent_state.user, "object_persistent_state.user");

  validateLocator(config.dictionary_state, "dictionary_state");
  validateLocator(config.dictionary_resolver, "dictionary_resolver");

  if (config.constants) {
    if (config.constants.global) {
      validateLocator(config.constants.global, "constants.global");
    }
    if (config.constants.user) {
      validateLocator(config.constants.user, "constants.user");
    }
  }

  if (!config.tools || typeof config.tools !== "object") {
    throw new Error("Validation Error: \"tools\" must be a valid configuration record.");
  }

  for (const [toolName, toolConfig] of Object.entries<any>(config.tools)) {
    if (!toolConfig || typeof toolConfig !== "object") {
      throw new Error(`Validation Error: Tool "${toolName}" config must be an object.`);
    }

    validateLocator(toolConfig.schema, `tools.${toolName}.schema`);

    if (!toolConfig.engine) {
      throw new Error(`Validation Error: Tool "${toolName}" must define an engine.`);
    }

    if (toolConfig.engine._type) {
      validateLocator(toolConfig.engine, `tools.${toolName}.engine`);
    } else {
      if (typeof toolConfig.engine !== "object") {
        throw new Error(`Validation Error: Tool "${toolName}" engine must be a ResourceLocator or a map of tables to ResourceLocators.`);
      }
      for (const tableName of Object.keys(toolConfig.engine)) {
        validateLocator(toolConfig.engine[tableName], `tools.${toolName}.engine[${tableName}]`);
      }
    }

    if (toolConfig.validation_engine) {
      validateLocator(toolConfig.validation_engine, `tools.${toolName}.validation_engine`);
    }
  }

  if (config.about_and_examples) {
    if (typeof config.about_and_examples !== "object") {
      throw new Error("Validation Error: \"about_and_examples\" must be an object.");
    }
    const fields = [
      "middleware_about",
      "filter_about",
      "filter_examples",
      "object_about",
      "object_examples",
      "dictionary_about",
      "dictionary_examples",
      "event_about",
      "event_examples"
    ];
    for (const field of fields) {
      const locators = config.about_and_examples[field];
      if (locators) {
        if (!Array.isArray(locators)) {
          throw new Error(`Validation Error: about_and_examples.${field} must be an array of ResourceLocators.`);
        }
        for (let i = 0; i < locators.length; i++) {
          validateLocator(locators[i], `about_and_examples.${field}[${i}]`);
        }
      }
    }
  }
}
