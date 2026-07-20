export async function validateStateReferences(
  schema: any,
  data: any,
  sessionId: string,
  stores: {
    filter?: any;
    object?: any;
    form?: any;
  }
): Promise<void> {
  if (data === undefined || data === null || !schema) {
    return;
  }

  if (schema["x-mcp-ref"]) {
    const refType = schema["x-mcp-ref"];
    const idOrAlias = String(data);

    if (refType === "filter" && stores.filter) {
      const exists = await stores.filter.getFilter(idOrAlias, sessionId);
      if (!exists) {
        throw new Error(`Invalid reference: Property value "${idOrAlias}" does not point to a valid filter in session.`);
      }
    } else if (refType === "object" && stores.object) {
      const exists = await stores.object.getObject(idOrAlias, sessionId);
      if (!exists) {
        throw new Error(`Invalid reference: Property value "${idOrAlias}" does not point to a valid object in session.`);
      }
    } else if (refType === "form" && stores.form) {
      const exists = await stores.form.getForm(idOrAlias, sessionId);
      if (!exists) {
        throw new Error(`Invalid reference: Property value "${idOrAlias}" does not point to a valid form in session.`);
      }
    }
  }

  if (schema.type === "object" || schema.properties) {
    if (typeof data === "object" && !Array.isArray(data)) {
      for (const [key, propSchema] of Object.entries(schema.properties || {})) {
        if (data[key] !== undefined) {
          await validateStateReferences(propSchema, data[key], sessionId, stores);
        }
      }
    }
  } else if (schema.type === "array" || schema.items) {
    if (Array.isArray(data)) {
      for (const item of data) {
        await validateStateReferences(schema.items, item, sessionId, stores);
      }
    }
  }
}
