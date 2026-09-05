import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AccountOwnerGenerationBoundary,
  runAccountOwnerWork,
} from "./accountOwnerGeneration.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

interface ModelsFixture {
  ownerId: string;
  providerEnablement: string[];
  pickerVisibility: string[];
  savedKeyConnection: "connected" | "missing";
  fallbackChain: string[];
  autoProviderLean: number;
  selectedModel: string;
  effort: string;
  turbo: boolean;
}

function modelsFixture(ownerId: string, ordinal: number): ModelsFixture {
  return {
    ownerId,
    providerEnablement: [`provider-${ordinal}`],
    pickerVisibility: [`visible-${ordinal}`],
    savedKeyConnection: ordinal % 2 === 0 ? "connected" : "missing",
    fallbackChain: [`fallback-${ordinal}-a`, `fallback-${ordinal}-b`],
    autoProviderLean: ordinal / 10,
    selectedModel: `model-${ordinal}`,
    effort: `effort-${ordinal}`,
    turbo: ordinal % 2 === 0,
  };
}

describe("account owner generation boundary", () => {
  it("invalidates an in-flight account A completion before account B can render it", async () => {
    const boundary = new AccountOwnerGenerationBoundary();
    boundary.setOwner("account-a");
    const accountA = boundary.capture();
    assert.ok(accountA);
    const response = deferred<string>();

    const pending = runAccountOwnerWork(boundary, accountA, () => response.promise);
    boundary.setOwner("account-b");
    response.resolve("account-a-model-settings");

    assert.deepEqual(await pending, { status: "stale" });
    assert.equal(boundary.capture()?.ownerId, "account-b");
  });

  it("does not execute account A queued work under account B authority", async () => {
    const boundary = new AccountOwnerGenerationBoundary();
    boundary.setOwner("account-a");
    const accountA = boundary.capture();
    assert.ok(accountA);
    const queueGate = deferred<void>();
    let mutationOwner: string | null = null;

    const queued = queueGate.promise.then(() =>
      runAccountOwnerWork(boundary, accountA, async () => {
        mutationOwner = boundary.capture()?.ownerId ?? null;
        return "saved";
      }),
    );
    boundary.setOwner("account-b");
    queueGate.resolve();

    assert.deepEqual(await queued, { status: "stale" });
    assert.equal(mutationOwner, null);
  });

  it("keeps every Models field on account B when account A resolves last", async () => {
    const boundary = new AccountOwnerGenerationBoundary();
    const accountASettings = deferred<ModelsFixture>();
    let renderedModels: ModelsFixture | null = null;

    boundary.setOwner("account-a");
    const accountA = boundary.capture();
    assert.ok(accountA);
    const staleLoad = runAccountOwnerWork(
      boundary,
      accountA,
      () => accountASettings.promise,
    ).then((result) => {
      if (result.status === "current") renderedModels = result.value;
    });

    boundary.setOwner("account-b");
    const accountB = boundary.capture();
    assert.ok(accountB);
    const currentLoad = await runAccountOwnerWork(boundary, accountB, async () =>
      modelsFixture("account-b", 2),
    );
    assert.equal(currentLoad.status, "current");
    if (currentLoad.status === "current") renderedModels = currentLoad.value;

    accountASettings.resolve(modelsFixture("account-a", 1));
    await staleLoad;
    assert.deepEqual(renderedModels, modelsFixture("account-b", 2));
  });

  it("allows only the newest of four account fixtures to apply out-of-order completions", async () => {
    const boundary = new AccountOwnerGenerationBoundary();
    const ownerIds = ["account-a", "account-b", "account-c", "account-d"];
    const responses = ownerIds.map(() => deferred<string>());
    const pending = ownerIds.map((ownerId, index) => {
      boundary.setOwner(ownerId);
      const ticket = boundary.capture();
      assert.ok(ticket);
      return runAccountOwnerWork(boundary, ticket, () => responses[index]!.promise);
    });

    for (let index = responses.length - 1; index >= 0; index -= 1) {
      responses[index]!.resolve(`${ownerIds[index]}-models`);
    }
    const results = await Promise.all(pending);

    assert.deepEqual(
      results.map((result) => result.status),
      ["stale", "stale", "stale", "current"],
    );
    assert.deepEqual(results[3], {
      status: "current",
      value: "account-d-models",
    });
  });

  it("invalidates same-owner tickets across explicit logout teardown", () => {
    const boundary = new AccountOwnerGenerationBoundary();
    boundary.setOwner("account-a");
    const beforeLogout = boundary.capture();
    assert.ok(beforeLogout);

    boundary.clear();
    boundary.setOwner("account-a");

    assert.equal(boundary.isCurrent(beforeLogout), false);
    assert.equal(boundary.capture()?.ownerId, "account-a");
  });
});
