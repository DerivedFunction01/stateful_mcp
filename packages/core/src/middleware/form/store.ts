import type { FormSchema, FormNextRule, OwnerScope } from "../../config/types";
import type { FormState, FormAnswerResult, PersistedFormState } from "./types";
import type { SessionFormStore, PersistentFormStore } from "../../adapters/storage/interfaces";
import { eventBroker } from "../../events/broker";

export function evaluateCondition(value: any, cond: { operator: string; value: any }): boolean {
  const op = cond.operator;
  const target = cond.value;

  switch (op) {
    case "eq":
      return value === target;
    case "neq":
      return value !== target;
    case "gt":
      return value > target;
    case "geq":
      return value >= target;
    case "lt":
      return value < target;
    case "leq":
      return value <= target;
    case "like":
      return typeof value === "string" && typeof target === "string" && value.toLowerCase().includes(target.toLowerCase());
    case "not_like":
      return typeof value === "string" && typeof target === "string" && !value.toLowerCase().includes(target.toLowerCase());
    case "in_set":
      return Array.isArray(target) && target.includes(value);
    case "not_in_set":
      return Array.isArray(target) && !target.includes(value);
    case "between":
      return Array.isArray(target) && target.length === 2 && value >= target[0] && value <= target[1];
    case "not_between":
      return Array.isArray(target) && target.length === 2 && (value < target[0] || value > target[1]);
    default:
      return false;
  }
}

export function resolveNavigationState(
  schema: FormSchema,
  answers: Record<string, any>,
  skipped: string[],
  focusQuestionId?: string | null
) {
  const visibleQuestions = new Set<string>();
  const visibleSections = new Set<string>();
  let currentQId: string | null = schema.start_question;

  const activePath: string[] = [];

  while (currentQId) {
    visibleQuestions.add(currentQId);
    activePath.push(currentQId);

    const sectionId = Object.keys(schema.sections || {}).find(secId => 
      schema.sections?.[secId]?.questions.includes(currentQId!)
    );
    if (sectionId) {
      visibleSections.add(sectionId);
    }

    const isAnswered = answers[currentQId] !== undefined;
    const isSkipped = skipped.includes(currentQId);

    if (!isAnswered && !isSkipped) {
      break;
    }

    let nextTarget: string | null = null;
    const qDef: any = schema.questions[currentQId];

    if (qDef?.next) {
      if (Array.isArray(qDef.next)) {
        const ans: any = answers[currentQId];
        for (const rule of (qDef.next as any[])) {
          if (rule.condition) {
            if (evaluateCondition(ans, rule.condition)) {
              nextTarget = rule.target;
              break;
            }
          } else {
            nextTarget = rule.target;
          }
        }
      } else if (typeof qDef.next === "object") {
        const ans: any = answers[currentQId];
        if (ans !== undefined && (qDef.next as any)[String(ans)] !== undefined) {
          nextTarget = (qDef.next as any)[String(ans)];
        } else {
          nextTarget = (qDef.next as any).default ?? null;
        }
      }
    }

    if (nextTarget === null && sectionId) {
      const secDef = schema.sections?.[sectionId];
      const secQuestions = secDef?.questions || [];
      const isLastQ = secQuestions[secQuestions.length - 1] === currentQId;
      if (isLastQ && secDef?.next) {
        if (Array.isArray(secDef.next)) {
          const ans: any = answers[currentQId];
          for (const rule of (secDef.next as any[])) {
            if (rule.condition) {
              if (evaluateCondition(ans, rule.condition)) {
                nextTarget = rule.target;
                break;
              }
            } else {
              nextTarget = rule.target;
            }
          }
        } else {
          nextTarget = (secDef.next as any).default ?? null;
        }
      }
    }

    if (nextTarget === null && sectionId) {
      const secQuestions = schema.sections?.[sectionId]?.questions || [];
      const idx = secQuestions.indexOf(currentQId);
      if (idx !== -1 && idx < secQuestions.length - 1) {
        nextTarget = secQuestions[idx + 1] ?? null;
      }
    }

    if (nextTarget) {
      if (schema.sections?.[nextTarget]) {
        currentQId = schema.sections?.[nextTarget]?.questions[0] ?? null;
      } else {
        currentQId = nextTarget;
      }
    } else {
      currentQId = null;
    }
  }

  let nextQuestions = activePath.filter(qId => answers[qId] === undefined && !skipped.includes(qId));
  if (focusQuestionId && activePath.includes(focusQuestionId)) {
    nextQuestions = [focusQuestionId];
  }

  const allQuestions = Object.keys(schema.questions);
  const hidden = allQuestions.filter(qId => !visibleQuestions.has(qId));
  const stale = allQuestions.filter(qId => !visibleQuestions.has(qId) && (answers[qId] !== undefined || skipped.includes(qId)));

  const complete = activePath.every(qId => {
    const qDef = schema.questions[qId];
    if (qDef?.required) {
      return answers[qId] !== undefined;
    }
    return true;
  });

  // Identify newly active / visible questions (unanswered ones on the active path)
  const revealed = activePath.filter(qId => answers[qId] === undefined && !skipped.includes(qId));

  return {
    visibleQuestions: Array.from(visibleQuestions),
    visibleSections: Array.from(visibleSections),
    next_questions: nextQuestions,
    revealed,
    hidden,
    stale,
    complete
  };
}

export function validateAnswer(qDef: any, value: any): void {
  if (value === undefined || value === null) {
    throw new Error("Answer value cannot be null or undefined.");
  }

  switch (qDef.answer_type) {
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Invalid answer: Expected boolean, received ${typeof value}`);
      }
      break;
    case "number":
      if (typeof value !== "number" || isNaN(value)) {
        throw new Error(`Invalid answer: Expected number, received ${typeof value}`);
      }
      break;
    case "date":
      if (isNaN(Date.parse(String(value)))) {
        throw new Error("Invalid answer: Expected a valid date string.");
      }
      break;
    case "multiple_choice":
      if (!qDef.options?.includes(value)) {
        throw new Error(`Invalid choice "${value}". Valid options: ${qDef.options?.join(", ")}`);
      }
      break;
    case "multi_select":
      if (!Array.isArray(value)) {
        throw new Error("Invalid answer: Expected an array for multi_select.");
      }
      for (const item of value) {
        if (!qDef.options?.includes(item)) {
          throw new Error(`Invalid choice "${item}" in multi_select.`);
        }
      }
      break;
    case "scale":
      if (typeof value !== "number" || isNaN(value)) {
        throw new Error(`Invalid answer: Expected number, received ${typeof value}`);
      }
      if (qDef.scale) {
        if (value < qDef.scale.min || value > qDef.scale.max) {
          throw new Error(`Value ${value} out of range [${qDef.scale.min}, ${qDef.scale.max}]`);
        }
      }
      break;
    case "ranked":
      if (!Array.isArray(value)) {
        throw new Error("Invalid answer: Expected an array for ranked options.");
      }
      break;
    case "free_text":
      if (typeof value !== "string") {
        throw new Error("Invalid answer: Expected a string value.");
      }
      break;
  }
}

export class FormStore {
  private filterStore?: any;
  private objectStore?: any;

  public setReferences(stores: { filter?: any; object?: any }) {
    this.filterStore = stores.filter;
    this.objectStore = stores.object;
  }

  constructor(
    private sessionStore: SessionFormStore,
    private persistentStore: PersistentFormStore,
    private formSchemas: Map<string, FormSchema>
  ) {}

  private async resolveId(sessionId: string, idOrAlias: string): Promise<string> {
    const targetId = await this.sessionStore.getAlias(sessionId, idOrAlias);
    return targetId || idOrAlias;
  }

  public async getForm(formIdOrAlias: string, sessionId: string): Promise<FormState | null> {
    const resolvedId = await this.resolveId(sessionId, formIdOrAlias);
    return this.sessionStore.get(sessionId, resolvedId);
  }

  public async init(
    schemaName: string,
    sessionId: string,
    alias?: string,
    parentFormId?: string
  ): Promise<string> {
    const schema = this.formSchemas.get(schemaName);
    if (!schema) {
      throw new Error(`Form schema "${schemaName}" not found.`);
    }

    const state: FormState & { focusQuestionId?: string | null } = {
      formId: "",
      parentFormId: parentFormId || null,
      schemaName,
      answers: {},
      skipped: [],
      stale: {},
      focusQuestionId: null,
      timestamp: new Date().toISOString()
    };

    const formId = await this.sessionStore.create(sessionId, state, alias);
    const finalId = alias || formId;

    eventBroker.emitStateChange({
      service: "form",
      action: "init",
      sessionId,
      id: finalId,
      data: { schemaName, parentFormId },
      timestamp: Date.now()
    });

    return finalId;
  }

  public async answer(
    formIdOrAlias: string,
    questionId: string,
    value: any,
    sessionId: string,
    newAlias?: string
  ): Promise<FormAnswerResult> {
    const formId = await this.resolveId(sessionId, formIdOrAlias);
    const parentState: any = await this.sessionStore.get(sessionId, formId);
    if (!parentState) {
      throw new Error(`Form state "${formIdOrAlias}" not found.`);
    }

    const schema = this.formSchemas.get(parentState.schemaName);
    if (!schema) {
      throw new Error(`Form schema "${parentState.schemaName}" not found.`);
    }

    const qDef = schema.questions[questionId];
    if (!qDef) {
      throw new Error(`Question "${questionId}" does not exist in schema "${parentState.schemaName}".`);
    }

    validateAnswer(qDef, value);

    if ((qDef as any)["x-mcp-ref"]) {
      const refType = (qDef as any)["x-mcp-ref"];
      const idOrAlias = String(value);
      if (refType === "filter" && this.filterStore) {
        const exists = await this.filterStore.getFilter(idOrAlias, sessionId);
        if (!exists) {
          throw new Error(`Invalid reference: Answer "${idOrAlias}" is not a valid filter ID in session.`);
        }
      } else if (refType === "object" && this.objectStore) {
        const exists = await this.objectStore.getObject(idOrAlias, sessionId);
        if (!exists) {
          throw new Error(`Invalid reference: Answer "${idOrAlias}" is not a valid object ID in session.`);
        }
      }
    }

    const answers = { ...parentState.answers, [questionId]: value };
    const skipped = parentState.skipped.filter((q: string) => q !== questionId);
    
    // Evaluate navigation state
    const nav = resolveNavigationState(schema, answers, skipped, null);

    const stale = { ...parentState.stale };
    for (const q of nav.stale) {
      stale[q] = true;
    }

    const newState: FormState & { focusQuestionId?: string | null } = {
      formId: "",
      parentFormId: formId,
      schemaName: parentState.schemaName,
      answers,
      skipped,
      stale,
      focusQuestionId: null,
      timestamp: new Date().toISOString()
    };

    const newFormId = await this.sessionStore.create(sessionId, newState, newAlias);

    eventBroker.emitStateChange({
      service: "form",
      action: "answer",
      sessionId,
      id: newFormId,
      data: { parentFormId: formId, questionId, value },
      timestamp: Date.now()
    });

    return {
      form_id: newFormId,
      next_questions: nav.next_questions,
      revealed: nav.revealed,
      hidden: nav.hidden,
      stale: nav.stale,
      complete: nav.complete
    };
  }

  public async skip(
    formIdOrAlias: string,
    questionId: string,
    sessionId: string,
    newAlias?: string
  ): Promise<FormAnswerResult> {
    const formId = await this.resolveId(sessionId, formIdOrAlias);
    const parentState: any = await this.sessionStore.get(sessionId, formId);
    if (!parentState) {
      throw new Error(`Form state "${formIdOrAlias}" not found.`);
    }

    const schema = this.formSchemas.get(parentState.schemaName);
    if (!schema) {
      throw new Error(`Form schema "${parentState.schemaName}" not found.`);
    }

    const qDef = schema.questions[questionId];
    if (!qDef) {
      throw new Error(`Question "${questionId}" does not exist in schema "${parentState.schemaName}".`);
    }

    if (qDef.required) {
      throw new Error(`Required question "${questionId}" cannot be skipped.`);
    }

    const answers = { ...parentState.answers };
    delete answers[questionId];

    const skipped = Array.from(new Set([...parentState.skipped, questionId]));

    const nav = resolveNavigationState(schema, answers, skipped, null);

    const stale = { ...parentState.stale };
    for (const q of nav.stale) {
      stale[q] = true;
    }

    const newState: FormState & { focusQuestionId?: string | null } = {
      formId: "",
      parentFormId: formId,
      schemaName: parentState.schemaName,
      answers,
      skipped,
      stale,
      focusQuestionId: null,
      timestamp: new Date().toISOString()
    };

    const newFormId = await this.sessionStore.create(sessionId, newState, newAlias);

    return {
      form_id: newFormId,
      next_questions: nav.next_questions,
      revealed: nav.revealed,
      hidden: nav.hidden,
      stale: nav.stale,
      complete: nav.complete
    };
  }

  public async back(
    formIdOrAlias: string,
    questionId: string,
    sessionId: string,
    newAlias?: string
  ): Promise<FormAnswerResult> {
    const formId = await this.resolveId(sessionId, formIdOrAlias);
    const parentState: any = await this.sessionStore.get(sessionId, formId);
    if (!parentState) {
      throw new Error(`Form state "${formIdOrAlias}" not found.`);
    }

    const schema = this.formSchemas.get(parentState.schemaName);
    if (!schema) {
      throw new Error(`Form schema "${parentState.schemaName}" not found.`);
    }

    if (!schema.questions[questionId]) {
      throw new Error(`Question "${questionId}" does not exist in schema "${parentState.schemaName}".`);
    }

    const newState: FormState & { focusQuestionId?: string | null } = {
      formId: "",
      parentFormId: formId,
      schemaName: parentState.schemaName,
      answers: { ...parentState.answers },
      skipped: [...parentState.skipped],
      stale: { ...parentState.stale },
      focusQuestionId: questionId,
      timestamp: new Date().toISOString()
    };

    const newFormId = await this.sessionStore.create(sessionId, newState, newAlias);
    const nav = resolveNavigationState(schema, newState.answers, newState.skipped, questionId);

    return {
      form_id: newFormId,
      next_questions: nav.next_questions,
      revealed: nav.revealed,
      hidden: nav.hidden,
      stale: nav.stale,
      complete: nav.complete
    };
  }

  public async resolve(formIdOrAlias: string, sessionId: string): Promise<any> {
    const formId = await this.resolveId(sessionId, formIdOrAlias);
    const state: any = await this.sessionStore.get(sessionId, formId);
    if (!state) {
      throw new Error(`Form state "${formIdOrAlias}" not found.`);
    }

    const schema = this.formSchemas.get(state.schemaName);
    if (!schema) {
      throw new Error(`Form schema "${state.schemaName}" not found.`);
    }

    const nav = resolveNavigationState(schema, state.answers, state.skipped, state.focusQuestionId);
    if (!nav.complete) {
      const unansweredRequired = Object.entries(schema.questions)
        .filter(([qId, q]) => q.required && state.answers[qId] === undefined && !state.skipped.includes(qId))
        .map(([qId]) => qId);
      throw new Error(`Form is not complete. Unanswered required questions: ${unansweredRequired.join(", ")}`);
    }

    // Filter out stale answers/skipped from the resolved output
    const activeAnswers: Record<string, any> = {};
    for (const qId of nav.visibleQuestions) {
      if (state.answers[qId] !== undefined) {
        activeAnswers[qId] = state.answers[qId];
      }
    }
    const activeSkipped = state.skipped.filter((qId: string) => nav.visibleQuestions.includes(qId));

    return {
      form_id: state.formId,
      schema_name: state.schemaName,
      answers: activeAnswers,
      skipped: activeSkipped,
      timestamp: state.timestamp
    };
  }

  public async inspect(formIdOrAlias: string, questionId: string | undefined, sessionId: string): Promise<any[]> {
    const formId = await this.resolveId(sessionId, formIdOrAlias);
    const history: any[] = [];
    
    let currId: string | null = formId;
    while (currId) {
      const state: any = await this.sessionStore.get(sessionId, currId);
      if (!state) break;

      if (questionId) {
        // Only inspect changes to a specific question
        history.push({
          form_id: state.formId,
          value: state.answers[questionId],
          skipped: state.skipped.includes(questionId),
          stale: !!state.stale[questionId],
          timestamp: state.timestamp
        });
      } else {
        history.push({
          form_id: state.formId,
          answers: state.answers,
          skipped: state.skipped,
          stale: state.stale,
          timestamp: state.timestamp
        });
      }

      currId = state.parentFormId;
    }

    return history;
  }

  public async compress(formId: string, sessionId: string): Promise<string> {
    const resolvedId = await this.resolveId(sessionId, formId);
    const form = await this.sessionStore.get(sessionId, resolvedId);
    if (!form) {
      throw new Error(`Form "${formId}" not in session`);
    }

    const schema = this.formSchemas.get(form.schemaName);
    if (!schema) {
      throw new Error(`Form schema "${form.schemaName}" not found.`);
    }

    const nav = resolveNavigationState(schema, form.answers, form.skipped);

    // Keep only active/visible answers, skipped, and stale status
    const activeAnswers: Record<string, any> = {};
    for (const qId of nav.visibleQuestions) {
      if (form.answers[qId] !== undefined) {
        activeAnswers[qId] = form.answers[qId];
      }
    }
    const activeSkipped = form.skipped.filter((qId: string) => nav.visibleQuestions.includes(qId));
    const activeStale: Record<string, boolean> = {};
    for (const qId of nav.visibleQuestions) {
      if (form.stale[qId]) {
        activeStale[qId] = true;
      }
    }

    const compressedId = `form_comp_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const compressedState: FormState = {
      formId: compressedId,
      parentFormId: null,
      schemaName: form.schemaName,
      answers: activeAnswers,
      skipped: activeSkipped,
      stale: activeStale,
      timestamp: new Date().toISOString()
    };

    await this.sessionStore.set(sessionId, compressedId, compressedState);
    return compressedId;
  }

  public async save(
    formId: string,
    tags: string[],
    description: string,
    scope: OwnerScope,
    sessionId: string
  ): Promise<string> {
    const resolvedId = await this.resolveId(sessionId, formId);
    let form = await this.sessionStore.get(sessionId, resolvedId);
    if (!form) {
      throw new Error(`Form "${formId}" not in session`);
    }
    let targetId = resolvedId;
    if (form.parentFormId !== null) {
      targetId = await this.compress(resolvedId, sessionId);
      const compressed = await this.sessionStore.get(sessionId, targetId);
      if (!compressed) {
        throw new Error("Compressed form not found");
      }
      form = compressed;
    }

    await this.persistentStore.set(
      targetId,
      {
        ...form,
        tags,
        description,
        schema_pinned_at: new Date().toISOString()
      },
      scope
    );

    await this.lockAncestors(targetId, sessionId);

    return targetId;
  }

  private async lockAncestors(formId: string, sessionId: string) {
    const ancestors = new Set<string>();
    await this.getAncestors(formId, sessionId, ancestors);
    for (const id of ancestors) {
      const node = await this.sessionStore.get(sessionId, id);
      if (node && !(node as any).gcLock) {
        (node as any).gcLock = true;
        await this.sessionStore.set(sessionId, id, node);
      }
    }
  }

  private async getAncestors(id: string, sessionId: string, visited: Set<string>): Promise<void> {
    const node = await this.sessionStore.get(sessionId, id);
    if (!node) return;
    if (node.parentFormId && !visited.has(node.parentFormId)) {
      visited.add(node.parentFormId);
      await this.getAncestors(node.parentFormId, sessionId, visited);
    }
  }

  public getSchema(schemaName: string): any {
    return this.formSchemas.get(schemaName) || null;
  }
}
