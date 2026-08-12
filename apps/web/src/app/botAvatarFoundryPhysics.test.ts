import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_AVATAR_FOUNDRY_PHYSICS,
  botAvatarFoundryDraggedBody,
  botAvatarFoundryInitialPhysicsBody,
  botAvatarFoundryThrowVelocity,
  stepBotAvatarFoundryPhysics,
  type BotAvatarFoundryPhysicsBody,
  type BotAvatarFoundryPhysicsBounds,
} from "./botAvatarFoundryPhysics.ts";

const BOUNDS: BotAvatarFoundryPhysicsBounds = {
  left: -260,
  right: 260,
  top: -180,
  bottom: 180,
  rollRadius: 112,
};

describe("Avatar Foundry shell physics", () => {
  it("drops a real body through the chute and collides with the floor", () => {
    let body = botAvatarFoundryInitialPhysicsBody(BOUNDS, false);
    let floorImpact = 0;
    for (let frame = 0; frame < 180; frame += 1) {
      const result = stepBotAvatarFoundryPhysics(body, BOUNDS, 1 / 60);
      body = result.body;
      if (result.collision === "floor") {
        floorImpact = Math.max(floorImpact, result.impactSpeed);
      }
    }
    assert.ok(floorImpact >= BOT_AVATAR_FOUNDRY_PHYSICS.minimumClankSpeed);
    assert.ok(body.y <= BOUNDS.bottom);
    assert.ok(body.x >= BOUNDS.left && body.x <= BOUNDS.right);
  });

  it("bounces off chamber walls and converts motion into roll", () => {
    const body: BotAvatarFoundryPhysicsBody = {
      x: BOUNDS.right - 2,
      y: BOUNDS.bottom,
      velocityX: 900,
      velocityY: 220,
      angle: 0,
      angularVelocity: 0,
      sleeping: false,
    };
    const result = stepBotAvatarFoundryPhysics(body, BOUNDS, 1 / 60);
    assert.equal(result.body.x, BOUNDS.right);
    assert.ok(result.body.velocityX < 0);
    assert.notEqual(result.body.angularVelocity, 0);
    assert.ok(result.impactSpeed > 0);
  });

  it("keeps pointer grabs bounded and clamps fling speed", () => {
    const dragged = botAvatarFoundryDraggedBody(
      { ...botAvatarFoundryInitialPhysicsBody(BOUNDS, true), sleeping: false },
      { x: 10_000, y: -10_000 },
      BOUNDS,
    );
    assert.equal(dragged.x, BOUNDS.right);
    assert.equal(dragged.y, BOUNDS.top);
    const fling = botAvatarFoundryThrowVelocity({ x: 8_000, y: -8_000 }, 8);
    assert.equal(fling.x, BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed);
    assert.equal(fling.y, -BOT_AVATAR_FOUNDRY_PHYSICS.maximumLinearSpeed);
  });

  it("uses a calm centered body for Reduced Motion", () => {
    assert.deepEqual(botAvatarFoundryInitialPhysicsBody(BOUNDS, true), {
      x: 0,
      y: BOUNDS.bottom,
      velocityX: 0,
      velocityY: 0,
      angle: 0,
      angularVelocity: 0,
      sleeping: true,
    });
  });

  it("absorbs tiny floor rebounds without a visible resting flicker", () => {
    const result = stepBotAvatarFoundryPhysics(
      {
        x: 0,
        y: BOUNDS.bottom - 0.2,
        velocityX: 4,
        velocityY: 28,
        angle: 0,
        angularVelocity: 0.02,
        sleeping: false,
      },
      BOUNDS,
      1 / 60,
    );
    assert.equal(result.collision, "floor");
    assert.equal(result.body.y, BOUNDS.bottom);
    assert.equal(result.body.velocityY, 0);
    assert.equal(result.body.sleeping, true);
  });
});
