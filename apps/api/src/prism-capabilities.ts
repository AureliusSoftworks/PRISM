import type { DatabaseSync } from "node:sqlite";
import {
  PRISM_ORCHESTRATION_VERSION,
  type PrismActionPreviewV1,
  type PrismActionProposalV1,
  type PrismActionRunV1,
  type PrismCapabilityDescriptorV1,
  type PrismCompanionSurfaceId,
  type PrismEntityReferenceV1,
  type PrismJsonObject,
  type PrismJsonValue,
} from "@localai/shared";
import {
  beginPrismActionRun,
  commitPrismActionRun,
  createPrismActionProposal,
  failPrismActionRun,
  latestUndoablePrismActionRun,
  markPrismActionProposalExecuted,
  markPrismActionUndoFailed,
  markPrismActionUndone,
  readPrismActionInverse,
  readPrismActionProposal,
  readPrismActionRun,
  readPrismActionRunByIdempotency,
} from "./prism-action-journal.ts";

const PRISM_WORKFLOW_CAPABILITY_ID = "prism.workflow";

const PRISM_WORKFLOW_DESCRIPTOR: PrismCapabilityDescriptorV1 = {
  schemaVersion: PRISM_ORCHESTRATION_VERSION,
  id: PRISM_WORKFLOW_CAPABILITY_ID,
  version: 1,
  label: "Prism workflow",
  description: "Executes an ordered set of validated Prism capabilities.",
  execution: "hybrid",
  inputSchema: { type: "object" },
  resultSchema: { type: "object" },
  surfaces: [],
  unavailableWhileLive: true,
  risk: "bulk",
  confirmation: "preview",
  privacy: "private",
  provider: "local-or-online",
  cost: "estimated",
  undo: "inverse",
  idempotent: true,
};

export interface PrismCapabilityContext {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  source: "prism" | "ui";
  surfaceId: PrismCompanionSurfaceId;
  hardLocal: boolean;
  live: boolean;
  now: Date;
  runId?: string;
}

export interface PrismCapabilityExecutionResult {
  result: PrismJsonValue | null;
  affectedEntities: PrismEntityReferenceV1[];
  inverse: PrismJsonObject | null;
  costMicroUsd?: number | null;
  nonReversibleConsequences?: string[];
}

export interface PrismCapabilityUndoResult {
  affectedEntities: PrismEntityReferenceV1[];
}

export interface PrismCapabilityDefinition {
  descriptor: PrismCapabilityDescriptorV1;
  /**
   * Deterministic database mutations default to one immediate transaction.
   * Hybrid/provider work must opt out so network waits never hold the database.
   */
  transactional?: boolean;
  validateInput: (value: PrismJsonObject) => PrismJsonObject;
  /**
   * Provider/network preparation runs before the mutation transaction. Its
   * JSON result can then be committed synchronously by execute.
   */
  prepare?: (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ) => Promise<PrismJsonValue>;
  prepareProposal?: (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ) => Promise<{
    input: PrismJsonObject;
    preview: PrismActionPreviewV1;
  }>;
  preview: (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
  ) => PrismActionPreviewV1;
  execute: (
    context: PrismCapabilityContext,
    input: PrismJsonObject,
    prepared?: PrismJsonValue,
  ) =>
    | PrismCapabilityExecutionResult
    | Promise<PrismCapabilityExecutionResult>;
  undo?: (
    context: PrismCapabilityContext,
    inverse: PrismJsonObject,
    run: PrismActionRunV1,
  ) => PrismCapabilityUndoResult;
}

function assertCapabilityAvailable(
  definition: PrismCapabilityDefinition,
  context: PrismCapabilityContext,
): void {
  const descriptor = definition.descriptor;
  if (
    descriptor.surfaces.length > 0 &&
    !descriptor.surfaces.includes(context.surfaceId)
  ) {
    throw new Error(`${descriptor.label} is not available on this surface.`);
  }
  if (
    descriptor.unavailableWhileLive &&
    context.live &&
    context.source === "prism"
  ) {
    throw new Error(`${descriptor.label} is unavailable during a live session.`);
  }
  if (context.hardLocal && descriptor.provider === "online-required") {
    throw new Error(`${descriptor.label} is unavailable in LOCAL mode.`);
  }
}

function proposalNeedsConfirmation(
  proposal: PrismActionProposalV1,
): boolean {
  return proposal.confirmation === "explicit-confirmation";
}

export class PrismCapabilityRegistry {
  readonly #definitions = new Map<string, PrismCapabilityDefinition>();

  register(definition: PrismCapabilityDefinition): void {
    if (this.#definitions.has(definition.descriptor.id)) {
      throw new Error(
        `Duplicate Prism capability: ${definition.descriptor.id}.`,
      );
    }
    this.#definitions.set(definition.descriptor.id, definition);
  }

  definition(id: string): PrismCapabilityDefinition | null {
    return this.#definitions.get(id) ?? null;
  }

  descriptors(context?: PrismCapabilityContext): PrismCapabilityDescriptorV1[] {
    return Array.from(this.#definitions.values()).flatMap((definition) => {
      if (!context) return [definition.descriptor];
      try {
        assertCapabilityAvailable(definition, context);
        return [definition.descriptor];
      } catch {
        return [];
      }
    });
  }

  createProposal(args: {
    context: PrismCapabilityContext;
    capabilityId: string;
    input: PrismJsonObject;
  }): PrismActionProposalV1 {
    const definition = this.definition(args.capabilityId);
    if (!definition) throw new Error("Prism selected an unknown capability.");
    if (definition.prepareProposal) {
      throw new Error(
        `${definition.descriptor.label} requires prepared proposal creation.`,
      );
    }
    assertCapabilityAvailable(definition, args.context);
    const input = definition.validateInput(args.input);
    const preview = definition.preview(args.context, input);
    return createPrismActionProposal({
      db: args.context.db,
      userId: args.context.userId,
      descriptor: definition.descriptor,
      input,
      preview,
      userKey: args.context.userKey,
      now: args.context.now,
    });
  }

  async createPreparedProposal(args: {
    context: PrismCapabilityContext;
    capabilityId: string;
    input: PrismJsonObject;
  }): Promise<PrismActionProposalV1> {
    const definition = this.definition(args.capabilityId);
    if (!definition) throw new Error("Prism selected an unknown capability.");
    if (!definition.prepareProposal) return this.createProposal(args);
    assertCapabilityAvailable(definition, args.context);
    const initialInput = definition.validateInput(args.input);
    const prepared = await definition.prepareProposal(
      args.context,
      initialInput,
    );
    const input = definition.validateInput(prepared.input);
    return createPrismActionProposal({
      db: args.context.db,
      userId: args.context.userId,
      descriptor: definition.descriptor,
      input,
      preview: prepared.preview,
      userKey: args.context.userKey,
      now: args.context.now,
    });
  }

  createWorkflowProposal(args: {
    context: PrismCapabilityContext;
    steps: Array<{ capabilityId: string; input: PrismJsonObject }>;
  }): PrismActionProposalV1 {
    if (args.steps.length === 0 || args.steps.length > 12) {
      throw new Error("A Prism workflow needs between one and twelve steps.");
    }
    const steps = args.steps.map((step) => {
      const definition = this.definition(step.capabilityId);
      if (!definition) throw new Error("Prism selected an unknown capability.");
      assertCapabilityAvailable(definition, args.context);
      const input = definition.validateInput(step.input);
      return {
        capabilityId: step.capabilityId,
        input,
        descriptor: definition.descriptor,
        preview: definition.preview(args.context, input),
      };
    });
    const riskRank: Record<PrismActionProposalV1["risk"], number> = {
      query: 0,
      navigation: 1,
      reversible: 2,
      bulk: 3,
      destructive: 4,
      costly: 5,
      "privacy-sensitive": 6,
      irreversible: 7,
    };
    const confirmationRank: Record<
      PrismActionProposalV1["confirmation"],
      number
    > = {
      none: 0,
      preview: 1,
      "explicit-confirmation": 2,
    };
    const highestRisk = steps.reduce(
      (current, step) =>
        riskRank[step.descriptor.risk] > riskRank[current]
          ? step.descriptor.risk
          : current,
      "query" as PrismActionProposalV1["risk"],
    );
    const highestConfirmation = steps.reduce(
      (current, step) =>
        confirmationRank[step.descriptor.confirmation] >
        confirmationRank[current]
          ? step.descriptor.confirmation
          : current,
      "none" as PrismActionProposalV1["confirmation"],
    );
    const descriptor: PrismCapabilityDescriptorV1 = {
      ...PRISM_WORKFLOW_DESCRIPTOR,
      risk: highestRisk,
      confirmation: highestConfirmation,
      provider: steps.some(
        (step) => step.descriptor.provider === "online-required",
      )
        ? "online-required"
        : steps.some(
              (step) => step.descriptor.provider === "local-or-online",
            )
          ? "local-or-online"
          : "none",
      cost: steps.some((step) => step.descriptor.cost === "paid")
        ? "paid"
        : steps.some((step) => step.descriptor.cost === "estimated")
          ? "estimated"
          : "none",
      undo: steps.some((step) => step.descriptor.undo !== "none")
        ? "inverse"
        : "none",
    };
    return createPrismActionProposal({
      db: args.context.db,
      userId: args.context.userId,
      descriptor,
      input: {
        steps: steps.map((step) => ({
          capabilityId: step.capabilityId,
          input: step.input,
        })),
      },
      preview: {
        summary: `Complete ${steps.length} connected Prism actions.`,
        consequences: steps.flatMap((step) =>
          step.preview.consequences.map(
            (consequence) => `${step.descriptor.label}: ${consequence}`,
          ),
        ),
        targets: steps.flatMap((step) => step.preview.targets),
        diffs: steps.flatMap((step) => step.preview.diffs),
        provider: null,
        model: null,
        estimatedCostMicroUsd: steps.reduce<number | null>(
          (total, step) =>
            total === null || step.preview.estimatedCostMicroUsd === null
              ? null
              : total + step.preview.estimatedCostMicroUsd,
          0,
        ),
      },
      userKey: args.context.userKey,
      now: args.context.now,
    });
  }

  async executeProposal(args: {
    context: PrismCapabilityContext;
    proposalId: string;
    confirmation: boolean;
    idempotencyKey: string;
    parentRunId?: string | null;
  }): Promise<PrismActionRunV1> {
    const existing = readPrismActionRunByIdempotency(
      args.context.db,
      args.context.userId,
      args.idempotencyKey,
    );
    if (existing) return existing;
    const proposal = readPrismActionProposal(
      args.context.db,
      args.context.userId,
      args.proposalId,
      args.context.userKey,
    );
    if (
      !proposal ||
      proposal.status !== "ready" ||
      new Date(proposal.expiresAt).getTime() <= args.context.now.getTime()
    ) {
      throw new Error("This Prism proposal is no longer available.");
    }
    const definition = this.definition(proposal.capabilityId);
    if (proposal.capabilityId === PRISM_WORKFLOW_CAPABILITY_ID) {
      return this.#executeWorkflowProposal({
        ...args,
        proposal,
      });
    }
    if (
      !definition ||
      definition.descriptor.version !== proposal.capabilityVersion
    ) {
      throw new Error("This Prism proposal uses an unavailable capability version.");
    }
    assertCapabilityAvailable(definition, args.context);
    if (proposalNeedsConfirmation(proposal) && !args.confirmation) {
      throw new Error("This Prism proposal requires explicit confirmation.");
    }
    const input = definition.validateInput(proposal.input);
    const run = beginPrismActionRun({
      db: args.context.db,
      userId: args.context.userId,
      descriptor: definition.descriptor,
      source: args.context.source,
      idempotencyKey: args.idempotencyKey,
      input,
      userKey: args.context.userKey,
      parentRunId: args.parentRunId,
      now: args.context.now,
    });
    if (run.status !== "running") return run;

    try {
      const prepared = definition.prepare
        ? await definition.prepare(
            { ...args.context, runId: run.id },
            input,
          )
        : undefined;
      const transactional = definition.transactional !== false;
      if (transactional) args.context.db.exec("BEGIN IMMEDIATE");
      const outcome = await definition.execute(
        { ...args.context, runId: run.id },
        input,
        prepared,
      );
      if (!transactional) args.context.db.exec("BEGIN IMMEDIATE");
      const committed = commitPrismActionRun({
        db: args.context.db,
        userId: args.context.userId,
        runId: run.id,
        result: outcome.result,
        affectedEntities: outcome.affectedEntities,
        inverse: outcome.inverse,
        userKey: args.context.userKey,
        costMicroUsd: outcome.costMicroUsd,
        nonReversibleConsequences: outcome.nonReversibleConsequences,
        now: args.context.now,
      });
      markPrismActionProposalExecuted(
        args.context.db,
        args.context.userId,
        proposal.id,
        run.id,
      );
      args.context.db.exec("COMMIT");
      return committed;
    } catch (error) {
      try {
        args.context.db.exec("ROLLBACK");
      } catch {
        // The failing handler may have rejected before the transaction began.
      }
      return failPrismActionRun(
        args.context.db,
        args.context.userId,
        run.id,
        error instanceof Error ? error.message : "Prism action failed.",
      );
    }
  }

  async #executeWorkflowProposal(args: {
    context: PrismCapabilityContext;
    proposalId: string;
    confirmation: boolean;
    idempotencyKey: string;
    parentRunId?: string | null;
    proposal: PrismActionProposalV1;
  }): Promise<PrismActionRunV1> {
    if (proposalNeedsConfirmation(args.proposal) && !args.confirmation) {
      throw new Error("This Prism workflow requires explicit confirmation.");
    }
    const rawSteps = args.proposal.input.steps;
    if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
      throw new Error("This Prism workflow has no executable steps.");
    }
    const run = beginPrismActionRun({
      db: args.context.db,
      userId: args.context.userId,
      descriptor: PRISM_WORKFLOW_DESCRIPTOR,
      source: args.context.source,
      idempotencyKey: args.idempotencyKey,
      input: args.proposal.input,
      userKey: args.context.userKey,
      parentRunId: args.parentRunId,
      now: args.context.now,
    });
    if (run.status !== "running") return run;
    const children: PrismActionRunV1[] = [];
    try {
      for (let index = 0; index < rawSteps.length; index += 1) {
        const rawStep = rawSteps[index];
        if (
          !rawStep ||
          typeof rawStep !== "object" ||
          Array.isArray(rawStep) ||
          typeof rawStep.capabilityId !== "string" ||
          !rawStep.input ||
          typeof rawStep.input !== "object" ||
          Array.isArray(rawStep.input)
        ) {
          throw new Error(`Prism workflow step ${index + 1} is invalid.`);
        }
        const childContext = {
          ...args.context,
          now: new Date(args.context.now.getTime() + index + 1),
        };
        const childProposal = this.createProposal({
          context: childContext,
          capabilityId: rawStep.capabilityId,
          input: rawStep.input as PrismJsonObject,
        });
        const child = await this.executeProposal({
          context: childContext,
          proposalId: childProposal.id,
          confirmation: true,
          idempotencyKey: `${args.idempotencyKey}:step:${index}`,
          parentRunId: run.id,
        });
        children.push(child);
        if (child.status !== "committed") {
          throw new Error(
            child.error ?? `Prism workflow step ${index + 1} failed.`,
          );
        }
      }
      const undoableChildRunIds = children
        .filter((child) => child.undoAvailable)
        .map((child) => child.id);
      const commitNow = new Date(
        args.context.now.getTime() + rawSteps.length + 1,
      );
      args.context.db.exec("BEGIN IMMEDIATE");
      const committed = commitPrismActionRun({
        db: args.context.db,
        userId: args.context.userId,
        runId: run.id,
        result: {
          childRuns: children.map((child) => ({
            id: child.id,
            capabilityId: child.capabilityId,
            status: child.status,
            result: child.result,
          })),
        },
        affectedEntities: children.flatMap(
          (child) => child.affectedEntities,
        ),
        inverse:
          undoableChildRunIds.length > 0
            ? { childRunIds: undoableChildRunIds }
            : null,
        userKey: args.context.userKey,
        costMicroUsd: children.reduce(
          (sum, child) => sum + (child.costMicroUsd ?? 0),
          0,
        ),
        nonReversibleConsequences: children.flatMap(
          (child) => child.nonReversibleConsequences,
        ),
        now: commitNow,
      });
      markPrismActionProposalExecuted(
        args.context.db,
        args.context.userId,
        args.proposal.id,
        run.id,
      );
      args.context.db.exec("COMMIT");
      return committed;
    } catch (error) {
      for (const child of [...children].reverse()) {
        if (child.status !== "committed" || !child.undoAvailable) continue;
        this.undo({
          context: {
            ...args.context,
            now: new Date(args.context.now.getTime() + rawSteps.length + 2),
          },
          runId: child.id,
        });
      }
      return failPrismActionRun(
        args.context.db,
        args.context.userId,
        run.id,
        error instanceof Error ? error.message : "Prism workflow failed.",
      );
    }
  }

  undo(args: {
    context: PrismCapabilityContext;
    runId?: string;
  }): PrismActionRunV1 {
    const run = args.runId
      ? readPrismActionRun(
          args.context.db,
          args.context.userId,
          args.runId,
        )
      : latestUndoablePrismActionRun(
          args.context.db,
          args.context.userId,
        );
    if (!run || run.status !== "committed") {
      throw new Error("There is no reversible Prism action to undo.");
    }
    if (run.capabilityId === PRISM_WORKFLOW_CAPABILITY_ID) {
      const inverse = readPrismActionInverse(
        args.context.db,
        args.context.userId,
        run.id,
        args.context.userKey,
      );
      const childRunIds = Array.isArray(inverse?.childRunIds)
        ? inverse.childRunIds.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
      if (childRunIds.length === 0) {
        throw new Error("The undo window for that workflow has expired.");
      }
      for (const childRunId of [...childRunIds].reverse()) {
        const child = readPrismActionRun(
          args.context.db,
          args.context.userId,
          childRunId,
        );
        if (!child || child.status !== "committed") continue;
        const undoneChild = this.undo({
          context: args.context,
          runId: childRunId,
        });
        if (undoneChild.status !== "undone") {
          return markPrismActionUndoFailed(
            args.context.db,
            args.context.userId,
            run.id,
            undoneChild.error ?? "A workflow child could not be undone.",
          );
        }
      }
      return markPrismActionUndone(
        args.context.db,
        args.context.userId,
        run.id,
        args.context.now,
      );
    }
    const definition = this.definition(run.capabilityId);
    if (!definition?.undo) {
      throw new Error("That Prism action cannot be undone.");
    }
    const inverse = readPrismActionInverse(
      args.context.db,
      args.context.userId,
      run.id,
      args.context.userKey,
    );
    if (!inverse) throw new Error("The undo window for that action has expired.");

    try {
      args.context.db.exec("BEGIN IMMEDIATE");
      definition.undo(args.context, inverse, run);
      const undone = markPrismActionUndone(
        args.context.db,
        args.context.userId,
        run.id,
        args.context.now,
      );
      args.context.db.exec("COMMIT");
      return undone;
    } catch (error) {
      try {
        args.context.db.exec("ROLLBACK");
      } catch {
        // Preserve the original undo failure.
      }
      return markPrismActionUndoFailed(
        args.context.db,
        args.context.userId,
        run.id,
        error instanceof Error ? error.message : "Prism undo failed.",
      );
    }
  }
}
