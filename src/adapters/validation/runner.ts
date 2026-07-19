// REFERENCE: docs/validation_examples.md
// Shared runtime validation engine runner.
// Supports: remote_url (POST) and file (JSON Schema via AJV) ResourceLocators.

import type { ResourceLocator } from "../../config/types";
import Ajv from "ajv";

const ajv = new Ajv({ strict: false });

export interface ExternalValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Resolves and executes a validation_engine against a given payload.
 * Supports:
 *   - _type: "file"       — loads JSON Schema and validates with AJV
 *   - _type: "remote_url" — POSTs JSON payload to a remote API endpoint
 *
 * Expected remote API response format:
 *   { "valid": true }
 *   { "valid": false, "errors": ["reason 1", ...] }
 *
 * POST body format:
 *   {
 *     "serviceType": "object" | "event",
 *     "schemaName": string,
 *     "data": any      // full object or full event array
 *   }
 */
export async function runValidationEngine(
  locator: ResourceLocator,
  payload: { serviceType: "object" | "event"; schemaName: string; data: any },
  workspaceRoot: string
): Promise<ExternalValidationResult> {
  const type = (locator as any)._type;

  if (type === "file") {
    const path = require("path");
    const fs = require("fs");
    const filePath = path.resolve(workspaceRoot, (locator as any).path);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Validation engine file not found: ${filePath}`);
    }
    const schema = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const validate = ajv.compile(schema);
    const valid = validate(payload.data) as boolean;
    return {
      valid,
      errors: valid ? undefined : (validate.errors || []).map((e: any) => `${e.instancePath} ${e.message}`)
    };
  }

  if (type === "remote_url") {
    const url = (locator as any).url as string;
    const rawHeaders = (locator as any).headers || {};

    // Substitute env: values in headers
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    for (const [key, val] of Object.entries(rawHeaders)) {
      const v = String(val);
      if (v.startsWith("env:")) {
        headers[key] = process.env[v.slice(4)] || "";
      } else {
        headers[key] = v;
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Validation engine remote call failed: HTTP ${response.status}`);
    }

    const result = (await response.json()) as ExternalValidationResult;
    return result;
  }

  throw new Error(`Unsupported validation_engine _type: "${type}". Supported: "file", "remote_url"`);
}
