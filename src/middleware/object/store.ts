import type { SessionObjectStore, PersistentObjectStore, PersistedObjectState } from "../../adapters/storage/interfaces";
import type { ObjectState, ObjectDiffResult } from "./types";
import type { OwnerScope } from "../../config/types";
import { ErrorCode, McpError } from "../../errors/types";
import { resolvePathSchema } from "./schema-walker";
import Ajv from "ajv";

const ajv = new Ajv();

export interface ValidationResult {
  valid: boolean;
  missing: (string | number)[][];
  invalid: Array<{ path: (string | number)[]; reason: string }>;
  warnings: Array<{ path: (string | number)[]; message: string }>;
}

export class ObjectStore {
  constructor(
    private session: SessionObjectStore,
    private persistent: PersistentObjectStore,
    private schemas: Map<string, any>, // name -> json schema
    private maxFields: number = 7,
    private maxDepth: number = 5,
    private chainThreshold: number = 15
  ) {}

  private async resolveId(id: string, sessionId: string): Promise<string> {
    const aliasTarget = await this.session.getAlias(sessionId, id);
    return aliasTarget || id;
  }

  private async lookup(id: string, sessionId: string, userId?: string): Promise<ObjectState | null> {
    const resolvedId = await this.resolveId(id, sessionId);
    return (
      (await this.session.get(sessionId, resolvedId)) ??
      (userId ? await this.persistent.get(resolvedId, { level: "user", userId }) : null) ??
      (await this.persistent.get(resolvedId, { level: "global" }))
    );
  }

  async getObject(id: string, sessionId: string, userId?: string): Promise<ObjectState | null> {
    return this.lookup(id, sessionId, userId);
  }

  async init(schemaName: string, sessionId: string, alias?: string): Promise<string> {
    const rootSchema = this.schemas.get(schemaName);
    if (!rootSchema) {
      throw new McpError(ErrorCode.SCHEMA_LOAD_FAILED, `Schema "${schemaName}" not registered`);
    }

    const state: Omit<ObjectState, "objectId"> = {
      schemaName,
      parentObjectId: null,
      data: {},
      createdAt: new Date().toISOString(),
      schema_pinned_at: new Date().toISOString(),
      linearDepth: 1,
      gcLock: false
    };

    const objectId = await this.session.create(sessionId, state, alias);
    return alias || objectId;
  }

  async from_saved(savedId: string, sessionId: string, userId?: string): Promise<string> {
    const saved = (userId ? await this.persistent.get(savedId, { level: "user", userId }) : null) ??
                  await this.persistent.get(savedId, { level: "global" });
    
    if (!saved) {
      throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Saved object "${savedId}" not found`);
    }

    const newId = `obj_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const state: ObjectState = {
      objectId: newId,
      schemaName: saved.schemaName,
      parentObjectId: null,
      data: { ...saved.data },
      createdAt: new Date().toISOString(),
      schema_pinned_at: saved.schema_pinned_at || new Date().toISOString(),
      linearDepth: 1,
      gcLock: false
    };

    await this.session.set(sessionId, newId, state);
    return newId;
  }

  async set(
    objectId: string,
    path: (string | number)[],
    value: unknown,
    sessionId: string,
    userId?: string,
    newAlias?: string
  ): Promise<string> {
    const resolvedParentId = await this.resolveId(objectId, sessionId);
    const parent = await this.lookup(resolvedParentId, sessionId, userId);
    if (!parent) {
      throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);
    }

    // Structural consistency check
    const rootSchema = this.schemas.get(parent.schemaName);
    if (rootSchema) {
      const defs = rootSchema.$defs || {};
      const leafSchema = resolvePathSchema(rootSchema, defs, path);
      if (leafSchema && value !== null && value !== undefined && typeof value !== "object") {
        try {
          const validate = ajv.compile(leafSchema);
          if (!validate(value)) {
            throw new McpError(
              ErrorCode.OBJECT_TYPE_MISMATCH,
              `Value at path [${path.join(",")}] fails schema validation`
            );
          }
        } catch (_) {
          // Fallback to basic type check if Ajv fails to compile (e.g. missing def refs)
          if (leafSchema.type && typeof value !== leafSchema.type) {
            throw new McpError(
              ErrorCode.OBJECT_TYPE_MISMATCH,
              `Value at path [${path.join(",")}] is not of type "${leafSchema.type}"`
            );
          }
        }
      }
    }

    const newData = JSON.parse(JSON.stringify(parent.data));
    this.setValueAtPath(newData, path, value);

    const siblings = await this.session.listChildren(sessionId, resolvedParentId);
    const linearDepth = siblings.length > 0 ? 1 : (parent.linearDepth || 1) + 1;

    const childState: Omit<ObjectState, "objectId"> = {
      schemaName: parent.schemaName,
      parentObjectId: resolvedParentId,
      data: newData,
      createdAt: new Date().toISOString(),
      schema_pinned_at: parent.schema_pinned_at,
      linearDepth,
      gcLock: false
    };

    const isAliasInput = (await this.session.getAlias(sessionId, objectId)) !== null;
    const targetAlias = newAlias || (isAliasInput ? objectId : undefined);

    const newId = await this.session.create(sessionId, childState, targetAlias);

    if (linearDepth > this.chainThreshold) {
      const compressedId = await this.compressSuffix(newId, sessionId, userId);
      if (targetAlias) {
        await this.session.setAlias(sessionId, targetAlias, compressedId);
        return targetAlias;
      }
      return compressedId;
    }

    return targetAlias || newId;
  }

  private async getAncestors(id: string, sessionId: string, userId?: string, visited = new Set<string>()): Promise<void> {
    if (visited.has(id)) return;
    visited.add(id);

    const node = await this.lookup(id, sessionId, userId);
    if (!node) return;

    if (node.parentObjectId) {
      await this.getAncestors(node.parentObjectId, sessionId, userId, visited);
    }
  }

  private async lockAncestors(objectId: string, sessionId: string, userId?: string) {
    const ancestors = new Set<string>();
    await this.getAncestors(objectId, sessionId, userId, ancestors);
    for (const id of ancestors) {
      const node = await this.lookup(id, sessionId, userId);
      if (node && !node.gcLock) {
        node.gcLock = true;
        await this.session.set(sessionId, id, node);
      }
    }
  }

  private async findNearestBranchPoint(objectId: string, sessionId: string, userId?: string): Promise<string | null> {
    let currentId: string | null = objectId;
    let branchPointId: string | null = null;

    while (currentId) {
      const node = await this.lookup(currentId, sessionId, userId);
      if (!node) break;

      const siblings = await this.session.listChildren(sessionId, currentId);
      if (siblings.length > 1 && currentId !== objectId) {
        branchPointId = currentId;
        break;
      }

      currentId = node.parentObjectId || null;
    }

    return branchPointId;
  }

  private async compressSuffix(objectId: string, sessionId: string, userId?: string): Promise<string> {
    const resolvedId = await this.resolveId(objectId, sessionId);
    const obj = await this.lookup(resolvedId, sessionId, userId);
    if (!obj) return resolvedId;

    const branchPointId = await this.findNearestBranchPoint(resolvedId, sessionId, userId);

    const compressedId = await this.session.create(sessionId, {
      schemaName: obj.schemaName,
      parentObjectId: branchPointId,
      data: { ...obj.data },
      createdAt: new Date().toISOString(),
      schema_pinned_at: obj.schema_pinned_at,
      linearDepth: 1,
      gcLock: obj.gcLock || false
    });

    console.error(JSON.stringify({
      event: "OBJECT_AUTO_COMPRESSED",
      new_object_id: compressedId,
      source_tip_id: resolvedId,
      linear_depth_at_compression: obj.linearDepth,
      branch_point_id: branchPointId
    }));

    return compressedId;
  }

  async gc(
    sessionId: string,
    keepIds: string[],
    keepAliases?: string[],
    deleteAliases?: string[]
  ): Promise<{ deleted_count: number; kept_count: number }> {
    if (deleteAliases && deleteAliases.length > 0) {
      for (const alias of deleteAliases) {
        await this.session.deleteAlias(sessionId, alias);
      }
    }
    if (keepAliases && keepAliases.length > 0) {
      const whitelist = new Set(keepAliases);
      const allAliases = await this.session.listAliases(sessionId);
      for (const item of allAliases) {
        if (!whitelist.has(item.alias)) {
          await this.session.deleteAlias(sessionId, item.alias);
        }
      }
    }

    const keptSet = new Set<string>();
    for (const id of keepIds) {
      const resolved = await this.resolveId(id, sessionId);
      await this.getAncestors(resolved, sessionId, undefined, keptSet);
    }

    const activeAliases = await this.session.listAliases(sessionId);
    for (const item of activeAliases) {
      await this.getAncestors(item.targetId, sessionId, undefined, keptSet);
    }

    const allSessionIds = await this.session.listSession(sessionId);
    for (const id of allSessionIds) {
      const node = await this.session.get(sessionId, id);
      if (node && node.gcLock) {
        await this.getAncestors(id, sessionId, undefined, keptSet);
      }
    }

    let deletedCount = 0;
    let keptCount = 0;
    const deletedIds: string[] = [];
    const keptIdsList: string[] = [];

    for (const id of allSessionIds) {
      if (!keptSet.has(id)) {
        await this.session.delete(sessionId, id);
        deletedIds.push(id);
        deletedCount++;
      } else {
        keptIdsList.push(id);
        keptCount++;
      }
    }

    console.error(JSON.stringify({
      event: "OBJECT_GC_RUN",
      sessionId,
      deletedIds,
      keptIds: keptIdsList,
      triggeredBy: "llm"
    }));

    return { deleted_count: deletedCount, kept_count: keptCount };
  }

  async patch(objectId: string, partial: Record<string, unknown>, sessionId: string, userId?: string): Promise<string> {
    let currentId = objectId;
    for (const [key, val] of Object.entries(partial)) {
      currentId = await this.set(currentId, [key], val, sessionId, userId);
    }
    return currentId;
  }

  async ref(
    objectId: string,
    path: (string | number)[],
    sourceObjectId: string,
    sourcePath: (string | number)[],
    sessionId: string,
    userId?: string
  ): Promise<string> {
    // Cycle check: B refs A, B.ref(A, path, B, path) -> cycle.
    if (objectId === sourceObjectId) {
      throw new McpError(ErrorCode.OBJECT_CYCLE_DETECTED, "Direct cross-field cycle detected");
    }

    // Store the reference descriptor inside the object's field value as a special ref object
    const refDescriptor = {
      $ref: {
        objectId: sourceObjectId,
        path: sourcePath
      }
    };

    return this.set(objectId, path, refDescriptor, sessionId, userId);
  }

  async array_append(objectId: string, path: (string | number)[], sessionId: string, userId?: string): Promise<string> {
    const resolvedParentId = await this.resolveId(objectId, sessionId);
    const parent = await this.lookup(resolvedParentId, sessionId, userId);
    if (!parent) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);

    const dataCopy = JSON.parse(JSON.stringify(parent.data));
    const arr = this.getValueAtPath(dataCopy, path);
    if (arr !== undefined && !Array.isArray(arr)) {
      throw new McpError(ErrorCode.OBJECT_TYPE_MISMATCH, `Field at path [${path.join(",")}] is not an array`);
    }

    const newArr = Array.isArray(arr) ? [...arr, {}] : [{}];
    this.setValueAtPath(dataCopy, path, newArr);

    const siblings = await this.session.listChildren(sessionId, resolvedParentId);
    const linearDepth = siblings.length > 0 ? 1 : (parent.linearDepth || 1) + 1;

    const state: Omit<ObjectState, "objectId"> = {
      schemaName: parent.schemaName,
      parentObjectId: resolvedParentId,
      data: dataCopy,
      createdAt: new Date().toISOString(),
      schema_pinned_at: parent.schema_pinned_at,
      linearDepth,
      gcLock: false
    };

    const isAliasInput = (await this.session.getAlias(sessionId, objectId)) !== null;
    const targetAlias = isAliasInput ? objectId : undefined;

    const newId = await this.session.create(sessionId, state, targetAlias);

    if (linearDepth > this.chainThreshold) {
      const compressedId = await this.compressSuffix(newId, sessionId, userId);
      if (targetAlias) {
        await this.session.setAlias(sessionId, targetAlias, compressedId);
        return targetAlias;
      }
      return compressedId;
    }

    return targetAlias || newId;
  }

  async array_remove(objectId: string, path: (string | number)[], index: number, sessionId: string, userId?: string): Promise<string> {
    const resolvedParentId = await this.resolveId(objectId, sessionId);
    const parent = await this.lookup(resolvedParentId, sessionId, userId);
    if (!parent) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);

    const dataCopy = JSON.parse(JSON.stringify(parent.data));
    const arr = this.getValueAtPath(dataCopy, path);
    if (!Array.isArray(arr)) {
      throw new McpError(ErrorCode.OBJECT_TYPE_MISMATCH, `Field at path [${path.join(",")}] is not an array`);
    }

    const newArr = [...arr];
    newArr.splice(index, 1);
    this.setValueAtPath(dataCopy, path, newArr);

    const siblings = await this.session.listChildren(sessionId, resolvedParentId);
    const linearDepth = siblings.length > 0 ? 1 : (parent.linearDepth || 1) + 1;

    const state: Omit<ObjectState, "objectId"> = {
      schemaName: parent.schemaName,
      parentObjectId: resolvedParentId,
      data: dataCopy,
      createdAt: new Date().toISOString(),
      schema_pinned_at: parent.schema_pinned_at,
      linearDepth,
      gcLock: false
    };

    const isAliasInput = (await this.session.getAlias(sessionId, objectId)) !== null;
    const targetAlias = isAliasInput ? objectId : undefined;

    const newId = await this.session.create(sessionId, state, targetAlias);

    if (linearDepth > this.chainThreshold) {
      const compressedId = await this.compressSuffix(newId, sessionId, userId);
      if (targetAlias) {
        await this.session.setAlias(sessionId, targetAlias, compressedId);
        return targetAlias;
      }
      return compressedId;
    }

    return targetAlias || newId;
  }

  async compress(objectId: string, sessionId: string, userId?: string): Promise<string> {
    const resolvedId = await this.resolveId(objectId, sessionId);
    const obj = await this.lookup(resolvedId, sessionId, userId);
    if (!obj) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);

    const compressedState: Omit<ObjectState, "objectId"> = {
      schemaName: obj.schemaName,
      parentObjectId: null,
      data: JSON.parse(JSON.stringify(obj.data)),
      createdAt: new Date().toISOString(),
      schema_pinned_at: obj.schema_pinned_at,
      linearDepth: 1,
      gcLock: obj.gcLock || false
    };

    const isAliasInput = (await this.session.getAlias(sessionId, objectId)) !== null;
    const targetAlias = isAliasInput ? objectId : undefined;

    const compressedId = await this.session.create(sessionId, compressedState, targetAlias);
    return targetAlias || compressedId;
  }

  async validate(objectId: string, sessionId: string, userId?: string): Promise<ValidationResult> {
    const obj = await this.lookup(objectId, sessionId, userId);
    if (!obj) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);

    const rootSchema = this.schemas.get(obj.schemaName);
    if (!rootSchema) {
      throw new McpError(ErrorCode.SCHEMA_LOAD_FAILED, `Schema "${obj.schemaName}" not loaded`);
    }

    const missing: (string | number)[][] = [];
    const invalid: Array<{ path: (string | number)[]; reason: string }> = [];
    const warnings: Array<{ path: (string | number)[]; message: string }> = [];

    // Recursively check required fields
    const checkRequired = (schema: any, data: any, currentPath: (string | number)[]) => {
      if (!schema) return;

      const defs = rootSchema.$defs || {};
      let resolvedSchema = schema;
      if (schema.$ref?.startsWith("#/$defs/")) {
        resolvedSchema = defs[schema.$ref.replace("#/$defs/", "")];
      }

      if (resolvedSchema.type === "object") {
        if (resolvedSchema.required && Array.isArray(resolvedSchema.required)) {
          for (const req of resolvedSchema.required) {
            const val = data?.[req];
            if (val === undefined || val === null || val === "") {
              missing.push([...currentPath, req]);
            }
          }
        }
        if (resolvedSchema.properties) {
          for (const key of Object.keys(resolvedSchema.properties)) {
            checkRequired(resolvedSchema.properties[key], data?.[key], [...currentPath, key]);
          }
        }
      } else if (resolvedSchema.type === "array") {
        if (Array.isArray(data)) {
          for (let i = 0; i < data.length; i++) {
            checkRequired(resolvedSchema.items, data[i], [...currentPath, i]);
          }
        }
      }
    };

    checkRequired(rootSchema, obj.data, []);

    // Evaluate cross-field constraints
    if (rootSchema.constraints && Array.isArray(rootSchema.constraints)) {
      for (const cons of rootSchema.constraints) {
        if (cons.op === "lt") {
          const field1 = cons.args?.[0]?.$field;
          const field2 = cons.args?.[1]?.$field;
          if (field1 && field2) {
            const val1 = obj.data[field1];
            const val2 = obj.data[field2];
            if (val1 !== undefined && val2 !== undefined && val1 >= val2) {
              invalid.push({
                path: [field1],
                reason: cons.error || `${field1} must be less than ${field2}`
              });
            }
          }
        }
      }
    }

    return {
      valid: missing.length === 0 && invalid.length === 0,
      missing,
      invalid,
      warnings
    };
  }

  async save(objectId: string, tags: string[], description: string, scope: OwnerScope, sessionId: string): Promise<string> {
    const obj = await this.session.get(sessionId, objectId);
    if (!obj) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not in session`);
    if (obj.parentObjectId !== null) {
      throw new McpError(ErrorCode.OBJECT_SCHEMA_EXCEEDED, "Compress the object before saving");
    }

    await this.persistent.set(objectId, {
      ...obj,
      tags,
      description,
      schema_pinned_at: obj.schema_pinned_at || new Date().toISOString()
    }, scope);

    await this.lockAncestors(objectId, sessionId, scope.level === "user" ? scope.userId : undefined);

    return objectId;
  }

  async resolve(objectId: string, mode: "tool_call" | "function", sessionId: string, userId?: string): Promise<unknown> {
    const validation = await this.validate(objectId, sessionId, userId);
    if (!validation.valid) {
      throw new McpError(
        ErrorCode.OBJECT_VALIDATION_FAILED,
        `Object validation failed. Missing: ${JSON.stringify(validation.missing)}, Invalid: ${JSON.stringify(validation.invalid)}`
      );
    }

    const obj = await this.lookup(objectId, sessionId, userId);
    if (!obj) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);

    // Recursively resolve references
    const resolveRefs = async (data: any): Promise<any> => {
      if (data && typeof data === "object") {
        if ("$ref" in data && typeof data.$ref === "object" && "objectId" in data.$ref) {
          const refTarget = data.$ref;
          const targetObj = await this.lookup(refTarget.objectId, sessionId, userId);
          if (!targetObj) {
            throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Referenced object "${refTarget.objectId}" not found`);
          }
          return this.getValueAtPath(targetObj.data, refTarget.path);
        }
        if (Array.isArray(data)) {
          return Promise.all(data.map(item => resolveRefs(item)));
        }
        const resolved: Record<string, any> = {};
        for (const [k, v] of Object.entries(data)) {
          resolved[k] = await resolveRefs(v);
        }
        return resolved;
      }
      return data;
    };

    const materialized = await resolveRefs(obj.data);

    if (mode === "tool_call") {
      return materialized;
    } else {
      // Return parameters as function keyword args
      return materialized;
    }
  }

  async inspect(objectId: string, sessionId: string, userId?: string): Promise<any> {
    const obj = await this.lookup(objectId, sessionId, userId);
    if (!obj) throw new McpError(ErrorCode.OBJECT_NOT_FOUND, `Object "${objectId}" not found`);

    const validation = await this.validate(objectId, sessionId, userId);
    return {
      objectId: obj.objectId,
      schemaName: obj.schemaName,
      data: obj.data,
      validation,
      createdAt: obj.createdAt
    };
  }

  async diff(objectIdA: string, objectIdB: string, sessionId: string, userId?: string): Promise<ObjectDiffResult> {
    const objA = await this.lookup(objectIdA, sessionId, userId);
    const objB = await this.lookup(objectIdB, sessionId, userId);
    if (!objA || !objB) {
      throw new McpError(ErrorCode.OBJECT_NOT_FOUND, "One or both objects for diff not found");
    }

    const added: Record<string, any> = {};
    const updated: Record<string, { old: any; new: any }> = {};
    const removed: string[] = [];

    const keysA = Object.keys(objA.data);
    const keysB = Object.keys(objB.data);

    for (const key of keysB) {
      if (!(key in objA.data)) {
        added[key] = objB.data[key];
      } else if (JSON.stringify(objA.data[key]) !== JSON.stringify(objB.data[key])) {
        updated[key] = { old: objA.data[key], new: objB.data[key] };
      }
    }

    for (const key of keysA) {
      if (!(key in objB.data)) {
        removed.push(key);
      }
    }

    return { added, updated, removed };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  private getValueAtPath(obj: any, path: (string | number)[]): any {
    let current = obj;
    for (const segment of path) {
      if (current === undefined || current === null) return undefined;
      current = current[segment];
    }
    return current;
  }

  private setValueAtPath(obj: any, path: (string | number)[], value: any): void {
    let current = obj;
    for (let i = 0; i < path.length; i++) {
      const segment = path[i]!;
      if (i === path.length - 1) {
        current[segment] = value;
      } else {
        if (current[segment] === undefined || current[segment] === null || typeof current[segment] !== "object") {
          current[segment] = typeof path[i + 1] === "number" ? [] : {};
        }
        current = current[segment];
      }
    }
  }
}
